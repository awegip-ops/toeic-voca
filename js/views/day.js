import { state, dayInfo, dayWords, dayStats, getRecord, saveSettings } from "../store.js";
import { esc, makeBookQuestion, quizzesOf } from "../logic.js";
import { isMastered, boxLabel } from "../srs.js";
import { shell, topbar } from "../ui.js";
import { wordBody, posBadge, sayBtn, quizStem } from "../render.js";

const dot = (rec) => `<i class="dot b${rec ? rec.box : 0}" title="${rec ? boxLabel(rec.box) : "아직 학습 전"}"></i>`;

export function day(root, [wk, dy]) {
  const week = +wk, d = +dy;
  const info = dayInfo(week, d);
  if (!info || !info.available) {
    root.innerHTML = shell(`${topbar({ title: `Week ${week} · Day ${d}`, back: "#/" })}<p class="empty">이 Day는 아직 준비되지 않았어요.</p>`, "home");
    return;
  }
  const words = dayWords(week, d);
  const st = dayStats(week, d);
  const hasBook = words.some((w) => quizzesOf(w).length);
  const scope = `day-${week}-${d}`;

  const rows = words.map((w) => {
    const rec = getRecord(w.id);
    return `<li class="row${isMastered(rec) ? " mastered" : ""}" data-id="${esc(w.id)}">
      ${dot(rec)}<span class="r-no">${w.no}</span>
      <div class="r-main"><b class="r-hw">${esc(w.headword)}</b> ${posBadge(w.pos)}<span class="r-meaning">${esc(w.meaning)}</span></div>
      ${sayBtn(w.headword, "sm")}</li>`;
  }).join("");

  root.innerHTML = shell(
    `${topbar({ title: `Week ${week} · Day ${d}`, sub: `${info.title} · ${info.partLabel}`, back: "#/" })}
     <section class="statline"><div><b>${st.total}</b><span>전체</span></div><div><b>${st.seen}</b><span>학습</span></div><div><b>${st.mastered}</b><span>암기</span></div><div><b>${st.weak}</b><span>약함</span></div></section>
     <section class="actions">
       <a class="act primary" href="#/study/${scope}"><span>🃏</span>카드 학습</a>
       <a class="act" href="#/quiz/${scope}/meaning"><span>✍️</span>뜻 맞추기</a>
       ${hasBook ? `<a class="act" href="#/quiz/${scope}/book"><span>📖</span>원서 문제</a>` : ""}
       <a class="act" href="#/study/${scope}/shuffle"><span>🔀</span>섞어서 카드</a>
     </section>
     <div class="list-head"><h2 class="sec">단어 ${words.length}개</h2>
       <label class="switch"><input type="checkbox" id="hide" ${state.settings.hideMeaning ? "checked" : ""}> 뜻 가리기</label></div>
     <ul class="rows${state.settings.hideMeaning ? " hide-meaning" : ""}" id="rows">${rows}</ul>`,
    "home"
  );

  const list = root.querySelector("#rows");
  root.onchange = (e) => {
    if (e.target.id === "hide") {
      saveSettings({ hideMeaning: e.target.checked });
      list.classList.toggle("hide-meaning", e.target.checked);
      list.querySelectorAll(".revealed").forEach((r) => r.classList.remove("revealed"));
    }
  };
  root.onclick = (e) => {
    if (e.target.closest(".say")) return;
    const row = e.target.closest(".row");
    if (!row) return;
    // 뜻 가리기 중에는 첫 탭에서 뜻만 보여 주고, 두 번째 탭에서 상세로 이동
    if (list.classList.contains("hide-meaning") && !row.classList.contains("revealed")) {
      row.classList.add("revealed");
      return;
    }
    location.hash = `#/word/${row.dataset.id}`;
  };
}

export function word(root, [id]) {
  const w = state.byId.get(id);
  if (!w) {
    location.hash = "#/";
    return;
  }
  const words = dayWords(w.week, w.day);
  const idx = words.findIndex((x) => x.id === w.id);
  const prev = words[idx - 1], next = words[idx + 1];
  const rec = getRecord(w.id);
  const qs = quizzesOf(w).map((z) => makeBookQuestion(w, z)).filter(Boolean);

  const quizBlock = qs
    .map(
      (q, n) => `<section class="book-q" data-n="${n}"><h4>원서 문제${qs.length > 1 ? ` ${n + 1}` : ""} <small>${q.kind === "synonym" ? "밑줄 친 단어와 가장 가까운 뜻" : "빈칸에 알맞은 말"}</small></h4>
        <div class="qstem">${quizStem(w, false, q.quiz)}</div>
        <div class="choices inline">${q.choices.map((c, i) => `<button class="choice" data-i="${i}">${esc(c.text)}</button>`).join("")}</div></section>`
    )
    .join("");

  root.innerHTML = shell(
    `${topbar({ title: w.headword, sub: `Week ${w.week} · Day ${w.day} · ${w.no}/${words.length}`, back: `#/day/${w.week}/${w.day}`, right: sayBtn(w.headword) })}
     <article class="word">
       <div class="w-head"><h2>${esc(w.headword)}</h2>${posBadge(w.pos)}<span class="box-state">${dot(rec)} ${rec ? boxLabel(rec.box) : "아직 학습 전"}</span></div>
       ${wordBody(w)}${quizBlock}
     </article>
     <div class="pager">${prev ? `<a class="btn ghost" href="#/word/${prev.id}">‹ ${esc(prev.headword)}</a>` : "<span></span>"}${next ? `<a class="btn ghost" href="#/word/${next.id}">${esc(next.headword)} ›</a>` : "<span></span>"}</div>`,
    "home"
  );

  if (qs.length) {
    root.onclick = (e) => {
      const b = e.target.closest(".choice");
      if (!b || b.disabled) return;
      const sec = b.closest(".book-q");
      const q = qs[+sec.dataset.n];
      const choice = q.choices[+b.dataset.i];
      sec.querySelectorAll(".choice").forEach((el, i) => {
        el.disabled = true;
        if (q.choices[i].correct) el.classList.add("right");
      });
      if (!choice.correct) b.classList.add("wrong");
      sec.querySelector(".qstem").innerHTML = quizStem(w, true, q.quiz);
    };
  }
}
