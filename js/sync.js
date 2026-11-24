// 기기 간 진도 동기화 (Firebase Firestore + 익명 인증). 책 내용은 올라가지 않고 학습 기록만 올라갑니다.
// 컬렉션은 기존 규칙이 허용하는 syncCodes 를 쓰고, 문서에 app 필드를 넣어 이전 앱의 코드와 구분합니다.
import { firebaseConfig } from "./firebase-config.js";

const CODE_KEY = "toeicVoca2.syncCode";
const DEVICE_KEY = "toeicVoca2.deviceId";
const APP_ID = "toeic-voca-2";
const SDK = "10.12.2";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I 제외

export const isSyncAvailable = () => !!firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
export const getSyncCode = () => localStorage.getItem(CODE_KEY);

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.getRandomValues(new Uint32Array(2)).join("-") + "-" + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

let modsPromise = null;
let ctx = null; // { db, fs }
let unsub = null;
let pushTimer = null;
let pendingPush = null; // 아직 올리지 못한 변경이 있으면 상태를 만드는 함수

const loadMods = () =>
  (modsPromise ||= Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`),
  ]));

async function init() {
  if (ctx) return ctx;
  if (!isSyncAvailable()) throw new Error("동기화 설정이 없어요.");
  if (!navigator.onLine) throw new Error("인터넷에 연결되어 있지 않아요.");
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await loadMods();
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  ctx = { db: fs.getFirestore(app), fs };
  return ctx;
}

const docRef = ({ db, fs }, code) => fs.doc(db, "syncCodes", code);
const payload = (fs, state) => ({ ...state, app: APP_ID, updatedAt: fs.serverTimestamp(), updatedBy: deviceId() });

function randomCode() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return [...r].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}

// 새 코드를 만들고 현재 기기의 상태로 초기화.
// 주의: 기존 보안 규칙은 '없는 문서'의 읽기를 거부하므로 중복 확인(getDoc)은 하지 않습니다.
// 코드는 32^6 ≈ 10억 가지라 우연히 겹칠 가능성은 사실상 없습니다.
export async function createSyncCode(state) {
  const c = await init();
  const code = randomCode();
  await c.fs.setDoc(docRef(c, code), payload(c.fs, state));
  localStorage.setItem(CODE_KEY, code);
  return code;
}

// 다른 기기의 코드로 연결. 원격 상태를 반환
export async function linkSyncCode(raw) {
  const c = await init();
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("코드는 6자리예요.");
  let snap;
  try {
    snap = await c.fs.getDoc(docRef(c, code));
  } catch (e) {
    // 규칙상 없는 문서/만료된 문서의 읽기는 permission-denied 로 돌아옴
    if (e.code === "permission-denied") throw new Error("없거나 만료된 코드예요. 코드를 다시 확인해 주세요.");
    throw e;
  }
  if (!snap.exists() || snap.data().app !== APP_ID) throw new Error("존재하지 않는 코드예요. (이전 단어장 앱의 코드는 쓸 수 없어요)");
  localStorage.setItem(CODE_KEY, code);
  return snap.data();
}

export function stopSync() {
  localStorage.removeItem(CODE_KEY);
  unsub?.();
  unsub = null;
}

// 상태가 바뀐 뒤 호출하면 잠시 뒤 원격에 올림 (디바운스)
export function schedulePush(getState, onResult) {
  if (!getSyncCode() || !isSyncAvailable()) return;
  clearTimeout(pushTimer);
  pendingPush = () => getState();
  pushTimer = setTimeout(async () => {
    try {
      const c = await init();
      await c.fs.setDoc(docRef(c, getSyncCode()), payload(c.fs, getState()), { merge: true });
      pendingPush = null;
      onResult?.(true);
    } catch (e) {
      console.error("동기화 업로드 실패", e);
      onResult?.(false, e);
    }
  }, 1200);
}

// 현재 원격 상태를 한 번 읽음 (코드가 만료/삭제됐으면 null)
export async function fetchRemote() {
  const c = await init();
  try {
    const snap = await c.fs.getDoc(docRef(c, getSyncCode()));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    if (e.code === "permission-denied") return null;
    throw e;
  }
}

export async function pushNow(state) {
  const c = await init();
  await c.fs.setDoc(docRef(c, getSyncCode()), payload(c.fs, state), { merge: true });
}

// 다른 기기가 바꾸면 onRemote(data) 호출
export async function subscribe(onRemote, onError, onAck) {
  if (!getSyncCode() || !isSyncAvailable()) return;
  try {
    const c = await init();
    unsub?.();
    unsub = c.fs.onSnapshot(
      docRef(c, getSyncCode()),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.updatedBy !== deviceId()) onRemote(d);
        else onAck?.(); // 내가 올린 변경이 서버에 반영됨
      },
      (e) => onError?.(e)
    );
  } catch (e) {
    onError?.(e);
  }
}
