import { state, dayStats, reviewInfo } from "../store.js";
import { esc } from "../logic.js";
import { shell, topbar } from "../ui.js";

function dayRow(t) {
  const label = `<span class="d-no">Day ${t.day}</span><span class="d-body"><b>${esc(t.title)}</b><em class="part">${esc(t.partLabel)}</em></span>`;
  if (!t.available) return `<div class="day soon" aria-disabled="true">${label}<span class="d-count">준비 중</span></div>`;
  const s = dayStats(t.week, t.day);
  const seen = (s.seen / s.total) * 100;
  const mast = (s.mastered / s.total) * 100;
  return `<a class="day ready" href="#/day/${t.week}/${t.day}">${label}
      <span class="d-prog" title="학습 ${s.seen} · 암기 ${s.mastered}"><u class="seen" style="width:${seen}%"></u><u class="mast" style="width:${mast}%"></u></span>
      <span class="d-count">${s.seen}/${s.total}</span></a>`;
}

export function home(root) {
  const info = reviewInfo();
  const st = state.streak;
  const weeks = new Map();
  for (const t of state.toc) {
    if (!weeks.has(t.week)) weeks.set(t.week, []);
    weeks.get(t.week).push(t);
  }
  const weekHtml = [...weeks].map(([wk, days]) => {
    const ready = days.filter((d) => d.available);
    const open = ready.length ? " open" : "";
    const total = ready.reduce((n, d) => n + d.count, 0);
    const seen = ready.reduce((n, d) => n + dayStats(d.week, d.day).seen, 0);
    const sum = ready.length ? `${seen}/${total}단어 학습` : "준비 중";
    return `<details class="week"${open}><summary><span class="w-name">Week ${wk}</span><span class="w-sum">${sum}</span></summary>
      <div class="days">${days.map(dayRow).join("")}${ready.length ? `<a class="week-listen" href="#/listen/week-${wk}">🎧 Week ${wk} 전체 이어 듣기</a>` : ""}</div></details>`;
  }).join("");

  const hero = info.total
    ? `<p class="hero-n"><b>${info.total}</b>개 학습 중 · 약한 단어 <b>${info.weak}</b>개</p>
       <p class="hero-s">오늘 ${st.todayReviewed || 0}번 학습했어요</p>
       <a class="btn light" href="#/study/review">복습 시작</a>
       <div class="hero-row"><a class="btn hero-sub" href="#/listen/review">🎧 복습 듣기</a><a class="btn hero-sub" href="#/typing/review">⌨️ 복습 타이핑</a></div>`
    : `<p class="hero-n">아직 학습한 단어가 없어요</p>
       <p class="hero-s">아래에서 Day를 골라 카드 학습을 시작해 보세요</p>
       <a class="btn light" href="#/day/1/1">Week 1 · Day 1 시작</a>`;

  root.innerHTML = shell(
    `${topbar({ title: "토익 기출 VOCA", sub: "서아쌤의 토익 비밀과외", right: `<span class="streak" title="연속 학습일">🔥 ${st.count}일</span>` })}
     <section class="hero"><p class="hero-k">오늘의 복습</p>${hero}</section>
     <section class="weeks"><h2 class="sec">학습 계획 <small>8주 · 40 Day</small></h2>${weekHtml}</section>`,
    "home"
  );
}
