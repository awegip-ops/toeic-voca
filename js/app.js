// 진입점: 데이터 로드 → 해시 라우터 → 화면 렌더
import * as store from "./store.js";
import { root, toast } from "./ui.js";
import { speak, stopSpeaking } from "./tts.js";
import { home } from "./views/home.js";
import { day, word } from "./views/day.js";
import { study } from "./views/study.js";
import { quiz } from "./views/quiz.js";
import { stats } from "./views/stats.js";

const routes = [
  [/^#\/?$/, home],
  [/^#\/day\/(\d+)\/(\d+)$/, day],
  [/^#\/word\/([\w-]+)$/, word],
  [/^#\/study\/(review|day-\d+-\d+)(?:\/(\w+))?$/, study],
  [/^#\/quiz\/(day-\d+-\d+)\/(\w+)$/, quiz],
  [/^#\/stats$/, stats],
];

let cleanup = null;
function route() {
  cleanup?.();
  cleanup = null;
  stopSpeaking();
  root.onclick = root.onchange = null;
  const hash = location.hash || "#/";
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (m) {
      cleanup = view(root, m.slice(1)) || null;
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
}

// 🔊 버튼은 어느 화면에서든 같은 방식으로 동작
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]");
  if (b) {
    e.preventDefault();
    e.stopPropagation();
    speak(b.dataset.say);
  }
}, true);

function recover(err) {
  console.error(err);
  try {
    toast("문제가 발생했어요. 홈으로 돌아갑니다.");
    location.hash = "#/";
    route();
  } catch { /* 복구 실패 시 더 할 수 있는 게 없음 */ }
}
window.addEventListener("error", (e) => recover(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => recover(e.reason));

function start() {
  return store.load().then(() => {
    window.addEventListener("hashchange", route);
    route();
    // 다른 기기에서 진도가 바뀌면 학습 중이 아닐 때만 화면을 새로 그림
    store.startSync(() => {
      if (!/^#\/(study|quiz)\//.test(location.hash)) route();
      toast("다른 기기의 학습 기록을 가져왔어요");
    });
  });
}

// 암호화된 책 데이터를 처음 열 때 비밀번호 입력 화면
function showUnlock(msg = "") {
  root.innerHTML = `<div class="page"><div class="unlock">
      <p class="done-emoji">🔒</p><h1>토익 기출 VOCA</h1>
      <p class="note">책 내용 보호를 위해 암호화되어 있어요.<br>비밀번호를 한 번 입력하면 이 기기에 기억됩니다.</p>
      <form id="unlock"><input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" autofocus>
        <button class="btn primary wide" type="submit">열기</button></form>
      <p class="err" id="err">${msg}</p></div></div>`;
  document.getElementById("unlock").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "여는 중…";
    store.setPassphrase(document.getElementById("pw").value);
    try {
      await start();
    } catch (err) {
      err.locked ? showUnlock(err.message) : fail(err);
    }
  };
}

const fail = (err) => {
  root.innerHTML = `<p class="empty">데이터를 불러오지 못했어요.<br>${String(err.message || err)}</p>`;
};

start().catch((err) => (err.locked ? showUnlock(err.message) : fail(err)));
