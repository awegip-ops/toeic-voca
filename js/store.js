// 데이터 로드 + 학습 기록(SRS)·연속 학습일·설정 저장 (localStorage)
import * as SRS from "./srs.js";
import { shuffle, mergeSrs } from "./logic.js";
import { decryptJson, normalizePass } from "./crypto.js";
import * as Sync from "./sync.js";

const KEYS = { srs: "toeicVoca2.srs", streak: "toeicVoca2.streak", settings: "toeicVoca2.settings" };
const DEFAULT_SETTINGS = { autoSpeak: true, rate: 0.95, direction: "en2ko", hideMeaning: false };

export const state = {
  words: [],
  byId: new Map(),
  toc: [],
  srs: {},
  streak: { count: 0, lastActiveDate: null, todayReviewed: 0 },
  settings: { ...DEFAULT_SETTINGS },
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
const writeJson = (key, v) => localStorage.setItem(key, JSON.stringify(v));

// 한국 시간 기준 '오늘' (UTC로 자르면 오전 9시 전에 날짜가 어긋남)
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const PASS_KEY = "toeicVoca2.pass";
export const hasPassphrase = () => !!localStorage.getItem(PASS_KEY);
export const setPassphrase = (p) => localStorage.setItem(PASS_KEY, normalizePass(p));

function locked(msg) {
  const e = new Error(msg);
  e.locked = true;
  return e;
}

// 책 데이터: 개발 PC에는 평문(words.json), 배포본에는 암호문(words.enc)만 있음
async function loadWords() {
  try {
    const r = await fetch("data/words.json");
    if (r.ok) return await r.json();
  } catch {}
  const r = await fetch("data/words.enc");
  if (!r.ok) throw new Error("책 데이터를 찾을 수 없어요.");
  const pass = localStorage.getItem(PASS_KEY);
  if (!pass) throw locked("");
  if (!globalThis.crypto?.subtle) throw new Error("이 주소(HTTP)에서는 암호를 풀 수 없어요. https 주소로 열어 주세요.");
  try {
    return await decryptJson(await r.json(), pass);
  } catch (e) {
    if (e.code === "BAD_PASSPHRASE") {
      localStorage.removeItem(PASS_KEY);
      throw locked("비밀번호가 맞지 않아요. 다시 입력해 주세요.");
    }
    throw e;
  }
}

export async function load() {
  const [words, toc] = await Promise.all([loadWords(), fetch("data/toc.json").then((r) => r.json())]);
  state.words = words;
  state.byId = new Map(words.map((w) => [w.id, w]));
  state.toc = toc;
  state.srs = readJson(KEYS.srs, {});
  state.settings = { ...DEFAULT_SETTINGS, ...readJson(KEYS.settings, {}) };
  state.streak = touchStreak();
}

function touchStreak() {
  const s = readJson(KEYS.streak, { count: 0, lastActiveDate: null, todayReviewed: 0 });
  const today = localDate();
  if (s.lastActiveDate === today) return s;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  s.count = s.lastActiveDate === localDate(y) ? s.count + 1 : 1;
  s.lastActiveDate = today;
  s.todayReviewed = 0;
  writeJson(KEYS.streak, s);
  return s;
}

export function saveSettings(patch) {
  Object.assign(state.settings, patch);
  writeJson(KEYS.settings, state.settings);
}

// ---------- 조회 ----------
export const dayInfo = (week, day) => state.toc.find((t) => t.week === week && t.day === day);
export const dayWords = (week, day) => state.words.filter((w) => w.week === week && w.day === day).sort((a, b) => a.no - b.no);
export const getRecord = (id) => state.srs[id] || null;

export function dayStats(week, day) {
  const words = dayWords(week, day);
  let seen = 0, mastered = 0, weak = 0;
  for (const w of words) {
    const r = getRecord(w.id);
    if (!r) continue;
    seen++;
    if (SRS.isMastered(r)) mastered++;
    if ((r.box || 1) <= 2) weak++;
  }
  return { total: words.length, seen, mastered, weak };
}

// ---------- 기록 ----------
export function rate(wordId, quality) {
  const rec = state.srs[wordId] || SRS.createInitialRecord(wordId);
  state.srs[wordId] = SRS.review(rec, quality);
  writeJson(KEYS.srs, state.srs);
  pushSoon();
  const today = localDate();
  if (state.streak.lastActiveDate !== today) state.streak = touchStreak(); // 자정을 넘겨 켜 둔 경우
  state.streak.todayReviewed = (state.streak.todayReviewed || 0) + 1;
  writeJson(KEYS.streak, state.streak);
}

// ---------- 동기화 ----------
export const syncState = { status: "off", error: null, at: null }; // off | ok | syncing | error
const collectSync = () => ({ srs: state.srs, streak: state.streak });
function pushSoon() {
  if (!Sync.getSyncCode()) return;
  syncState.status = "syncing";
  Sync.schedulePush(collectSync, (ok, err) => {
    syncState.status = ok ? "ok" : "error";
    syncState.error = ok ? null : err?.message || "업로드 실패";
    if (ok) syncState.at = new Date();
  });
}

// 원격 상태를 합침. 바뀐 단어 수를 반환
export function mergeRemote(data) {
  const { merged, changed } = mergeSrs(state.srs, data.srs, state.byId);
  if (changed) {
    state.srs = merged;
    writeJson(KEYS.srs, state.srs);
  }
  const rs = data.streak;
  if (rs && (rs.lastActiveDate || "") > (state.streak.lastActiveDate || "")) {
    state.streak = { ...state.streak, count: rs.count, lastActiveDate: rs.lastActiveDate, todayReviewed: rs.todayReviewed || 0 };
    writeJson(KEYS.streak, state.streak);
  }
  return changed;
}

export async function startSync(onChange) {
  if (!Sync.getSyncCode()) return;
  syncState.status = "syncing";
  // 앱을 열 때마다: 원격과 합치고, 합친 결과를 다시 올려 두 기기를 일치시킴 (이전 업로드가 유실됐어도 복구)
  try {
    const remote = await Sync.fetchRemote();
    if (!remote) throw new Error("동기화 코드가 없거나 만료됐어요. 동기화를 해제하고 다시 연결해 주세요.");
    const n = mergeRemote(remote);
    await Sync.pushNow(collectSync());
    if (n) onChange?.(n);
  } catch (e) {
    syncState.status = "error";
    syncState.error = e?.message || "연결 실패";
    return;
  }
  await Sync.subscribe(
    (d) => {
      const n = mergeRemote(d);
      syncState.status = "ok";
      syncState.at = new Date();
      if (n) onChange?.(n);
    },
    (e) => {
      syncState.status = "error";
      syncState.error = e?.message || "연결 실패";
    },
    () => {
      syncState.status = "ok";
      syncState.at = new Date();
    }
  );
}

export async function createSync() {
  const code = await Sync.createSyncCode(collectSync());
  syncState.status = "ok";
  return code;
}

export async function linkSync(code) {
  const data = await Sync.linkSyncCode(code);
  const n = mergeRemote(data);
  await Sync.pushNow(collectSync()); // 합친 결과를 다시 올려 두 기기를 일치시킴
  syncState.status = "ok";
  return n;
}

export const stopSync = () => {
  Sync.stopSync();
  syncState.status = "off";
};
export const syncCode = () => Sync.getSyncCode();
export const syncAvailable = () => Sync.isSyncAvailable();

// 복습 대상: 한 번이라도 학습한 단어. 박스가 낮을수록 세션에 여러 번 등장
export function reviewPool() {
  return state.words.filter((w) => getRecord(w.id));
}

export function reviewInfo() {
  const pool = reviewPool();
  return { total: pool.length, weak: pool.filter((w) => (getRecord(w.id).box || 1) <= 2).length };
}

export function buildReviewQueue(cap = 30) {
  const multiset = [];
  for (const w of reviewPool()) {
    const n = SRS.repeatCountForBox(getRecord(w.id).box);
    for (let i = 0; i < n; i++) multiset.push(w);
  }
  // 같은 단어가 연달아 나오지 않게 섞은 뒤 앞에서 자름
  return shuffle(multiset).slice(0, cap);
}

export function overallStats() {
  const boxes = [0, 0, 0, 0, 0, 0]; // [미학습, box1..5]
  for (const w of state.words) boxes[getRecord(w.id)?.box || 0]++;
  return { total: state.words.length, boxes, mastered: state.words.filter((w) => SRS.isMastered(getRecord(w.id))).length };
}

// ---------- 백업 ----------
export function exportBackup() {
  return { app: "toeic-voca-2", version: 1, exportedAt: new Date().toISOString(), srs: state.srs, streak: state.streak, settings: state.settings };
}

export function importBackup(obj) {
  if (!obj || obj.app !== "toeic-voca-2" || typeof obj.srs !== "object") throw new Error("이 앱의 백업 파일이 아닙니다.");
  // 같은 단어의 기록이 양쪽에 있으면 복습 횟수가 더 많은 쪽을 유지
  let merged = 0;
  for (const [id, rec] of Object.entries(obj.srs)) {
    if (!state.byId.has(id) || typeof rec.box !== "number") continue;
    const cur = state.srs[id];
    if (!cur || (rec.reviewCount || 0) > (cur.reviewCount || 0)) {
      state.srs[id] = rec;
      merged++;
    }
  }
  writeJson(KEYS.srs, state.srs);
  return merged;
}

export function resetProgress() {
  stopSync(); // 초기화가 다른 기기의 기록을 되돌리지 않도록 동기화를 끊음
  state.srs = {};
  writeJson(KEYS.srs, state.srs);
}
