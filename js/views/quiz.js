// 객관식 문제 풀이: 뜻 맞추기(모든 Day) / 원서 문제(책에 실린 Part 5·6 빈칸, Part 7 동의어)
import { state, dayWords, dayInfo, rate } from "../store.js";
import { esc, shuffle, makeMeaningQuestion, makeBookQuestion, quizzesOf } from "../logic.js";
import { shell } from "../ui.js";
import { wordBody, quizStem, posBadge, sayBtn } from "../render.js";
import { speak } from "../tts.js";

const INSTRUCTION = {
  meaning: "알맞은 뜻을 고르세요",
  blank: "빈칸에 알맞은 단어를 고르세요",
  synonym: "밑줄 친 단어와 가장 가까운 의미를 고르세요",
};

export function quiz(root, [scope, mode]) {
  const [, wk, dy] = scope.match(/^day-(\d+)-(\d+)$/) || [];
  const info = dayInfo(+wk, +dy);
  if (!info?.available || !["meaning", "book"].includes(mode)) {
    location.hash = "#/";
    return;
  }
  const words = dayWords(+wk, +dy);
  const backHref = `#/day/${wk}/${dy}`;
  const title = `${mode === "book" ? "원서 문제" : "뜻 맞추기"} · Day ${dy}`;

  const build = (ws) =>
    shuffle(mode === "book" ? ws.flatMap((w) => quizzesOf(w).map((z) => [w, z])) : ws.map((w) => [w, null]))
      .map(([w, z]) => (mode === "book" ? makeBookQuestion(w, z) : makeMeaningQuestion(w, words, state.words)))
      .filter(Boolean);

  let questions = build(words);
  if (!questions.length) {
    location.hash = backHref;
    return;
  }
  let qi = 0, answered = false, results = [];

  function renderQuestion() {
    const q = questions[qi];
    const w = q.word;
    const pct = Math.round((qi / questions.length) * 100);
    const stem =
      q.kind === "meaning"
        ? `<p class="c-hw">${esc(w.headword)}</p><div class="c-sub">${posBadge(w.pos)}${sayBtn(w.headword)}</div>`
        : quizStem(w, false, q.quiz);
    root.innerHTML = shell(
      `<div class="session">
        <div class="s-top"><a class="icon-btn" href="${backHref}" aria-label="그만두기">✕</a>
          <div class="progress"><u style="width:${pct}%"></u></div><span class="s-count">${qi + 1}/${questions.length}</span></div>
        <p class="q-inst">${INSTRUCTION[q.kind]}</p>
        <div class="q-card">${stem}</div>
        <div class="choices" id="choices">${q.choices.map((c, i) => `<button class="choice" data-i="${i}"><kbd>${i + 1}</kbd>${esc(c.text)}</button>`).join("")}</div>
        <div id="feedback"></div>
      </div>`,
      "home",
      false
    );
    answered = false;
    if (q.kind === "meaning" && state.settings.autoSpeak) speak(w.headword);
  }

  function choose(i) {
    if (answered) return;
    const q = questions[qi];
    const picked = q.choices[i];
    if (!picked) return;
    answered = true;
    results.push({ word: q.word, ok: picked.correct });
    rate(q.word.id, picked.correct ? 4 : 0); // 맞히면 박스 +1, 틀리면 박스 1로
    root.querySelectorAll(".choice").forEach((el, n) => {
      el.disabled = true;
      if (q.choices[n].correct) el.classList.add("right");
    });
    if (!picked.correct) root.querySelector(`.choice[data-i="${i}"]`).classList.add("wrong");
    if (q.kind !== "meaning") root.querySelector(".q-card").innerHTML = quizStem(q.word, true, q.quiz);
    const last = qi === questions.length - 1;
    root.querySelector("#feedback").innerHTML = `
      <div class="fb ${picked.correct ? "ok" : "no"}"><b>${picked.correct ? "정답이에요! 👍" : "아쉬워요"}</b><span class="fb-word">${esc(q.word.headword)}</span></div>
      <div class="fb-body">${wordBody(q.word)}</div>
      <button class="btn primary wide sticky" data-act="next">${last ? "결과 보기" : "다음 문제"} <kbd>Enter</kbd></button>`;
    root.querySelector("#feedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function next() {
    if (!answered) return;
    qi++;
    qi >= questions.length ? finish() : renderQuestion();
  }

  function finish() {
    const ok = results.filter((r) => r.ok).length;
    const wrong = results.filter((r) => !r.ok).map((r) => r.word);
    const pct = Math.round((ok / results.length) * 100);
    root.innerHTML = shell(
      `<div class="done"><p class="done-emoji">${pct >= 80 ? "🏆" : pct >= 50 ? "👏" : "💪"}</p><h2>${esc(title)}</h2>
        <p class="score"><b>${ok}</b> / ${results.length} <small>(${pct}%)</small></p>
        ${wrong.length ? `<div class="wrong-list"><h4>틀린 단어</h4>${wrong.map((w) => `<a href="#/word/${esc(w.id)}"><b>${esc(w.headword)}</b><span>${esc(w.meaning)}</span></a>`).join("")}</div>` : '<p class="done-sub">모두 맞혔어요!</p>'}
        <div class="done-actions">
          ${wrong.length ? '<button class="btn primary wide" data-act="retry">틀린 문제만 다시</button>' : ""}
          <button class="btn ghost wide" data-act="all">전체 다시 풀기</button>
          <a class="btn ghost wide" href="${backHref}">돌아가기</a></div></div>`,
      "home",
      false
    );
    root._wrong = wrong;
  }

  function restart(ws) {
    questions = build(ws);
    qi = 0;
    results = [];
    renderQuestion();
  }

  root.onclick = (e) => {
    const c = e.target.closest(".choice");
    if (c) return choose(+c.dataset.i);
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "next") next();
    else if (act === "retry") restart(root._wrong);
    else if (act === "all") restart(words);
  };

  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    if (/^[1-4]$/.test(e.key)) choose(+e.key - 1);
    else if (e.key === "Enter" || e.key === " ") {
      if (answered) {
        e.preventDefault();
        next();
      }
    } else if (e.key === "Escape") location.hash = backHref;
  };
  document.addEventListener("keydown", onKey);
  renderQuestion();
  return () => document.removeEventListener("keydown", onKey);
}
