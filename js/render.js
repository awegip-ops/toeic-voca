// 단어 한 개의 내용(뜻·파생어·콜로케이션·TIP…)을 HTML 로 그리는 공통 렌더러
import { esc, boldHeadword, blankHtml, markHtml, POS_LABEL, posText } from "./logic.js";

const sayBtn = (text, cls = "") => `<button class="say ${cls}" data-say="${esc(text)}" aria-label="발음 듣기">🔊</button>`;

export const posBadge = (pos) => (pos ? `<span class="pos">${esc(posText(pos))}</span>` : "");

function sensesHtml(w) {
  return `<ol class="senses">${w.senses
    .map(
      (s) => `<li><span class="s-mean">${esc(s.meaning_kr)}</span>
        <span class="syn">${s.synonyms.map((x) => `<button class="chip" data-say="${esc(x)}">${esc(x)}</button>`).join("")}</span></li>`
    )
    .join("")}</ol>`;
}

function collocHtml(w) {
  return `<ul class="colloc">${w.colloc
    .map(
      (c) => `<li>${sayBtn(c.en)}<div><span class="en">${boldHeadword(c.en, w.headword)}</span>
        ${c.exam ? '<span class="badge-exam">기출</span>' : ""}<span class="ko">${esc(c.ko)}</span></div></li>`
    )
    .join("")}</ul>`;
}

const derivedHtml = (w) =>
  `<ul class="derived">${w.derived
    .map((d) => `<li><button class="say sm" data-say="${esc(d.form)}" aria-label="발음 듣기">🔊</button><b>${esc(d.form)}</b> <i>${esc(posText(d.pos))}</i> ${esc(d.meaning_kr)}</li>`)
    .join("")}</ul>`;

const relatedHtml = (w) =>
  `<ul class="related">${w.related
    .map((r) => `<li>${sayBtn(r.en, "sm")}<span class="en">${esc(r.en)}</span>${r.ko ? `<span class="ko">${esc(r.ko)}</span>` : ""}</li>`)
    .join("")}</ul>`;

const dialogueHtml = (w) =>
  `<div class="dialogue">${w.dialogue
    .map((d) => `<div class="dl ${d.spk === "M" ? "m" : "w"}"><span class="spk">${d.spk === "M" ? "남" : d.spk === "W" ? "여" : ""}</span>
      <div><p class="en">${boldHeadword(d.en, w.headword)} ${sayBtn(d.en, "sm")}</p><p class="ko">${esc(d.ko)}</p></div></div>`)
    .join("")}</div>`;

const examplesHtml = (w) =>
  w.examples
    .map((x) => `<div class="example"><p class="en">${boldHeadword(x.en, w.headword)} ${sayBtn(x.en, "sm")}</p><p class="ko">${esc(x.ko)}</p></div>`)
    .join("");

const paraphraseHtml = (w) =>
  `<ul class="paraphrase">${w.paraphrases
    .map((p) => `<li><button class="chip" data-say="${esc(p.en)}">${esc(p.en)}</button>${p.ko ? `<span class="ko">${esc(p.ko)}</span>` : ""}</li>`)
    .join("")}</ul>`;

const qaHtml = (w) =>
  w.qa
    .map((x) => `<div class="qa"><p class="q">Q. ${esc(x.q_ko)}</p>${x.answer.map((a) => `<p class="a">➜ ${esc(a)}</p>`).join("")}</div>`)
    .join("");

// opts.meaning=false 면 뜻을 생략(플래시카드에서 따로 보여 줄 때)
export function wordBody(w, { meaning = true } = {}) {
  const out = [];
  if (meaning && !w.senses) out.push(`<div class="w-meaning">${esc(w.meaning)}</div>`);
  if (w.senses) out.push(sensesHtml(w));
  if (w.paraphrases) out.push(`<section><h4>바꿔 쓰는 표현 <small>Paraphrasing</small></h4>${paraphraseHtml(w)}</section>`);
  if (w.dialogue) out.push(`<section><h4>대화·담화 예문</h4>${dialogueHtml(w)}</section>`);
  if (w.qa) out.push(`<section><h4>이렇게 출제돼요</h4>${qaHtml(w)}</section>`);
  if (w.examples) out.push(`<section><h4>예문</h4>${examplesHtml(w)}</section>`);
  if (w.derived) out.push(`<section><h4>파생어</h4>${derivedHtml(w)}</section>`);
  if (w.colloc) out.push(`<section><h4>콜로케이션 <small>기출 표현</small></h4>${collocHtml(w)}</section>`);
  // 원서의 'TIP' 첫 줄이 "관련 기출"/"기출 Paraphrasing" 같은 소제목뿐인 경우는 박스 대신 소제목으로 사용
  const LABELS = ["관련 기출", "기출 Paraphrasing", "상위어 Paraphrasing"];
  const label = LABELS.includes((w.tip || "").trim()) ? w.tip.trim() : "";
  if (w.related) out.push(`<section><h4>${esc(label || "관련 표현")}</h4>${relatedHtml(w)}</section>`);
  if (w.tip && !label) out.push(`<aside class="tip"><b>만점 TIP</b><p>${esc(w.tip).replace(/\n/g, "<br>")}</p></aside>`);
  return out.join("");
}

// 책에 실린 문제(빈칸/동의어)를 보여 주는 블록. answered=true 면 정답과 해석까지 공개
export function quizStem(w, answered, q = w.quiz) {
  if (!q) return "";
  if (q.highlight) return `<p class="q-stem">${markHtml(q.stem, q.highlight)}</p>${answered && q.translation_kr ? `<p class="q-tr">${esc(q.translation_kr)}</p>` : ""}`;
  return `<p class="q-stem">${blankHtml(q.stem, answered ? q.answer : null)}</p>`;
}

export { sayBtn };
