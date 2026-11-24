// 플래시카드 학습: 카드 뒤집기 → 자기 평가(다시/어려움/좋음/쉬움) → 라이트너 박스 반영
import { state, dayWords, dayInfo, buildReviewQueue, rate, saveSettings } from "../store.js";
import { esc, buildStudyQueue } from "../logic.js";
import { shell } from "../ui.js";
import { wordBody, posBadge, sayBtn } from "../render.js";
import { speak } from "../tts.js";

// 평가 버튼 → SRS quality, 같은 세션에서 다시 나올 위치(몇 장 뒤)
const RATINGS = [
  { key: "again", label: "다시", q: 0, gap: 3, hint: "곧 다시" },
  { key: "hard", label: "어려움", q: 3, gap: 8, hint: "조금 뒤" },
  { key: "good", label: "좋음", q: 4, gap: 0, hint: "" },
  { key: "easy", label: "쉬움", q: 5, gap: 0, hint: "" },
];

export function study(root, [scope, mode]) {
  let queue, title, backHref;
  if (scope === "review") {
    queue = buildReviewQueue(30);
    title = "복습";
    backHref = "#/";
  } else {
    const [, wk, dy] = scope.match(/^day-(\d+)-(\d+)$/) || [];
    const info = dayInfo(+wk, +dy);
    if (!info?.available) {
      location.hash = "#/";
      return;
    }
    queue = buildStudyQueue(dayWords(+wk, +dy), { shuffled: mode === "shuffle" });
    title = `Week ${wk} · Day ${dy}`;
    backHref = `#/day/${wk}/${dy}`;
  }

  if (!queue.length) {
    root.innerHTML = shell(`<header class="topbar"><a class="icon-btn" href="${backHref}">‹</a><div class="tb-title"><h1>${title}</h1></div></header>
      <p class="empty">복습할 단어가 아직 없어요.<br>먼저 Day를 골라 카드 학습을 해 보세요.</p><a class="btn primary wide" href="#/">Day 고르기</a>`, "review");
    return;
  }

  let i = 0, flipped = false;
  const tally = { again: 0, hard: 0, good: 0, easy: 0 };
  const initial = queue.length;

  const front = (w) => {
    if (state.settings.direction === "ko2en") return `<p class="c-ko">${esc(w.meaning)}</p>`;
    return `<p class="c-hw">${esc(w.headword)}</p><div class="c-sub">${posBadge(w.pos)}${sayBtn(w.headword)}</div>`;
  };
  const back = (w) => {
    const head = state.settings.direction === "ko2en"
      ? `<p class="c-hw sm">${esc(w.headword)}</p><div class="c-sub">${posBadge(w.pos)}${sayBtn(w.headword)}</div>`
      : `<p class="c-hw sm">${esc(w.headword)}</p>`;
    return `${head}<div class="c-body">${wordBody(w)}</div>`;
  };

  function render() {
    if (i >= queue.length) return finish();
    const w = queue[i];
    const pct = Math.round((i / queue.length) * 100);
    root.innerHTML = shell(
      `<div class="session">
        <div class="s-top"><a class="icon-btn" href="${backHref}" aria-label="그만두기">✕</a>
          <div class="progress"><u style="width:${pct}%"></u></div><span class="s-count">${i + 1}/${queue.length}</span>
          <button class="icon-btn txt" data-act="dir" title="카드 방향">${state.settings.direction === "ko2en" ? "한→영" : "영→한"}</button></div>
        <div class="card${flipped ? " flipped" : ""}" data-act="flip" tabindex="0">${flipped ? back(w) : front(w)}
          ${flipped ? "" : '<p class="c-tap">탭하거나 Space 키로 뒤집기</p>'}</div>
        ${flipped
          ? `<div class="rate">${RATINGS.map((r, n) => `<button class="rate-btn ${r.key}" data-act="rate" data-n="${n}"><b>${r.label}</b><small>${n + 1}</small></button>`).join("")}</div>`
          : `<button class="btn primary wide" data-act="flip">정답 보기</button>`}
      </div>`,
      "review",
      false
    );
    if (!flipped && state.settings.autoSpeak && state.settings.direction !== "ko2en") speak(w.headword);
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    const w = queue[i];
    render();
    if (state.settings.autoSpeak && state.settings.direction === "ko2en") speak(w.headword);
  }

  function doRate(n) {
    if (!flipped) return;
    const r = RATINGS[n];
    const w = queue[i];
    rate(w.id, r.q);
    tally[r.key]++;
    if (r.gap) queue.splice(Math.min(i + 1 + r.gap, queue.length), 0, w); // 모르는 카드는 이번 세션에서 한 번 더
    i++;
    flipped = false;
    render();
  }

  function finish() {
    const total = tally.again + tally.hard + tally.good + tally.easy;
    root.innerHTML = shell(
      `<div class="done"><p class="done-emoji">🎉</p><h2>${esc(title)} 완료</h2>
        <p class="done-sub">카드 ${initial}장 · 평가 ${total}번</p>
        <div class="tally"><div class="again"><b>${tally.again}</b>다시</div><div class="hard"><b>${tally.hard}</b>어려움</div><div class="good"><b>${tally.good}</b>좋음</div><div class="easy"><b>${tally.easy}</b>쉬움</div></div>
        <div class="done-actions">
          <button class="btn primary wide" data-act="again">한 번 더</button>
          ${scope !== "review" ? `<a class="btn ghost wide" href="#/quiz/${scope}/meaning">뜻 맞추기로 확인</a>` : ""}
          <a class="btn ghost wide" href="${backHref}">돌아가기</a></div></div>`,
      "review",
      false
    );
  }

  root.onclick = (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "flip") flip();
    else if (act.dataset.act === "rate") doRate(+act.dataset.n);
    else if (act.dataset.act === "dir") {
      saveSettings({ direction: state.settings.direction === "ko2en" ? "en2ko" : "ko2en" });
      render();
    } else if (act.dataset.act === "again") location.reload();
  };

  const onKey = (e) => {
    if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flipped ? null : flip();
    } else if (flipped && /^[1-4]$/.test(e.key)) doRate(+e.key - 1);
    else if (e.key === "Escape") location.hash = backHref;
  };
  document.addEventListener("keydown", onKey);
  render();
  return () => document.removeEventListener("keydown", onKey);
}
