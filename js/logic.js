// DOM/저장소에 의존하지 않는 순수 함수 모음 (node 테스트 대상)

export function esc(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 영어 문장 안의 표제어(활용형 포함)를 <b>로 강조한 HTML
export function boldHeadword(text, headword) {
  const safe = esc(text);
  const base = headwordRegex(headword);
  if (!base) return safe;
  const re = new RegExp(base.source, "gi");
  return safe.replace(re, (m) => `<b class="hw">${m}</b>`);
}

const BLANK = "-------";

// 원서 빈칸 문제: 빈칸을 밑줄 칸으로 바꾼 HTML. answer 를 주면 정답을 채워서 보여 줌
export function blankHtml(stem, answer) {
  const parts = esc(stem).split(BLANK);
  const fill = answer == null ? `<span class="blank"></span>` : `<span class="filled">${esc(answer)}</span>`;
  return parts.join(fill);
}

// 동의어 문제: 밑줄 단어를 <mark>로 표시한 HTML
export function markHtml(stem, highlight) {
  const safe = esc(stem);
  const h = esc(highlight);
  const i = safe.indexOf(h);
  return i < 0 ? safe : safe.slice(0, i) + `<mark>${h}</mark>` + safe.slice(i + h.length);
}

// "~", "A" 같은 자리표시 기호는 읽어 주지 않도록 정리한 TTS용 문장
export function speakable(text) {
  return String(text).replace(/\[[^\]]*\]/g, "").replace(/~/g, "").replace(/\s+/g, " ").trim();
}

// 뜻 맞추기: 표제어를 보고 알맞은 한국어 뜻 고르기 (오답은 같은 Day 단어 우선)
export function makeMeaningQuestion(word, sameDay, everyone) {
  const seen = new Set([word.meaning]);
  // 뜻이 같은 단어(예: 같은 뜻의 다른 표제어)는 오답 후보에서 제외해 선택지가 겹치지 않게 함
  const ok = (w) => w.id !== word.id && w.meaning && !seen.has(w.meaning);
  const picked = [];
  for (const pool of [shuffle(sameDay), shuffle(everyone)]) {
    for (const w of pool) {
      if (picked.length >= 3) break;
      if (ok(w)) {
        picked.push(w);
        seen.add(w.meaning);
      }
    }
  }
  const choices = shuffle([word, ...picked]).map((w) => ({ text: w.meaning, correct: w.id === word.id }));
  return { kind: "meaning", word, choices };
}

// 원서 문제: 책에 실린 Part 5·6 빈칸 / Part 7 동의어 문제
export const quizzesOf = (word) => word.quizzes || (word.quiz ? [word.quiz] : []);

export function makeBookQuestion(word, q = word.quiz) {
  if (!q) return null;
  const kind = q.highlight ? "synonym" : "blank";
  const choices = shuffle(q.choices).map((text) => ({ text, correct: text === q.answer }));
  if (choices.filter((c) => c.correct).length !== 1) return null; // 데이터 이상은 출제하지 않음
  return { kind, word, choices, quiz: q };
}

// 플래시카드 세션 큐: 기본은 번호 순서, 섞기 옵션 지원
export function buildStudyQueue(words, { shuffled = false } = {}) {
  return shuffled ? shuffle(words) : words.slice().sort((a, b) => a.day - b.day || a.no - b.no);
}

// 두 기기의 복습 기록 병합: 단어별로 복습 횟수가 많은 쪽(같으면 더 최근) 유지
export function mergeSrs(local, remote, validIds) {
  const merged = { ...local };
  let changed = 0;
  for (const [id, r] of Object.entries(remote || {})) {
    if (!validIds.has(id) || !r || typeof r.box !== "number") continue;
    const c = merged[id];
    const rc = r.reviewCount || 0;
    const cc = c ? c.reviewCount || 0 : -1;
    if (!c || rc > cc || (rc === cc && (r.lastReviewed || "") > (c.lastReviewed || ""))) {
      merged[id] = r;
      changed++;
    }
  }
  return { merged, changed };
}

export const POS_LABEL = { n: "명사", v: "동사", adj: "형용사", adv: "부사", prep: "전치사", conj: "접속사", phr: "구", a: "형용사", ad: "부사" };
// "n/v" 같은 복합 품사를 "명사·동사" 로
export const posText = (pos) => (pos || "").split("/").map((p) => POS_LABEL[p] || p).join("·");

// ======================= 타이핑 학습 =======================
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
export const hasHangul = (s) => HANGUL.test(s);

// 표제어에서 '쳐야 할 영어'를 뽑음: 한글 설명·자리표시(+, ~, A, B, -ing)·[괄호 선택]을 정리하고
// "hall/street" 같은 대체 표기는 모든 경우를 허용
export function typingTargets(headword) {
  const base = headword
    .replace(/\[[^\]]*\]/g, " ") // [duties/tasks] 같은 선택 표기는 제외
    .replace(/\(([^)]*)\)/g, "$1") // (cash) register → cash register
    .replace(/[가-힣]+/g, " ")
    .replace(/[+~]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^-?ing$/i.test(t));
  let variants = [[]];
  for (const tok of base) {
    const opts = /^[A-Za-z']+(\/[A-Za-z']+)+$/.test(tok) ? tok.split("/") : [tok];
    variants = variants.flatMap((v) => opts.map((o) => [...v, o])).slice(0, 8);
  }
  return [...new Set(variants.map((v) => v.join(" ")))].filter(Boolean);
}

// 비교용 정규화: 대소문자·공백·구두점·하이픈·자리표시(단독 A/B) 무시
export function normTyping(s) {
  return String(s)
    .split(/\s+/)
    .filter((t) => !/^[AB]$/.test(t))
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// 'exact' | 'near'(철자 한 글자 차이) | 'wrong' | 'ime'(한글로 입력됨)
export function gradeTyping(input, targets) {
  if (hasHangul(input)) return { result: "ime" };
  const n = normTyping(input);
  if (!n) return { result: "wrong" };
  let near = false;
  for (const t of targets) {
    const tn = normTyping(t);
    if (n === tn) return { result: "exact", answer: t };
    if (tn.length >= 5 && editDistance(n, tn) <= 1) near = true;
  }
  return { result: near ? "near" : "wrong" };
}

// 표제어(활용형 포함)를 찾는 정규식 — 강조·빈칸 만들기에 공통 사용
export function headwordRegex(headword) {
  const prefixes = (headword.match(/[A-Za-z]+/g) || [])
    .filter((t) => t.length >= 3)
    .map((t) => (t.length > 5 ? t.slice(0, t.length - 2) : t.length === 5 ? t.slice(0, 4) : t));
  return prefixes.length ? new RegExp(String.raw`\b(` + prefixes.join("|") + ")[a-z']*", "i") : null;
}

// 빈칸 문장 만들기: { sentence(영어, 빈칸 ______), answer, hint(한글) } 또는 null
export function makeCloze(w) {
  const q = w.quiz;
  if (q && !q.highlight && q.stem.includes("-------") && q.answer)
    return { sentence: q.stem.replace("-------", "______"), answer: q.answer, hint: w.meaning };
  if (q && q.highlight && q.stem.includes(q.highlight))
    return { sentence: q.stem.replace(q.highlight, "______"), answer: q.highlight, hint: q.translation_kr || w.meaning };
  const re = headwordRegex(w.headword);
  if (!re) return null;
  const pool = [
    ...(w.colloc || []).slice().sort((a, b) => Number(b.exam) - Number(a.exam)).map((c) => ({ en: c.en, ko: c.ko })),
    ...(w.dialogue || []).map((d) => ({ en: d.en, ko: d.ko })),
    ...(w.examples || []).map((x) => ({ en: x.en, ko: x.ko })),
  ];
  for (const p of pool) {
    const m = p.en.match(re);
    if (m) return { sentence: p.en.replace(m[0], "______"), answer: m[0], hint: p.ko || w.meaning };
  }
  return null;
}

// ======================= 듣기(자동재생) =======================
// 한 단어를 읽는 순서: [단어(영) → 뜻(한) → 예문(영) → 단어(영)]
export function exampleSentence(w) {
  const q = w.quiz;
  if (q && !q.highlight && q.answer && q.stem.includes("-------")) return q.stem.replace("-------", q.answer);
  const c = (w.colloc || []).slice().sort((a, b) => Number(b.exam) - Number(a.exam))[0];
  if (c) return c.en;
  if (w.dialogue?.length) return w.dialogue[0].en;
  if (w.examples?.length) return w.examples[0].en;
  if (q && q.highlight) return q.stem;
  return null;
}

export function listenText(w) {
  const en = typingTargets(w.headword)[0] || w.headword;
  const ko = String(w.meaning || "").replace(/\s*\/\s*/g, ", ").replace(/[~]/g, "").replace(/\s+/g, " ").trim();
  return { en, ko };
}

// 한 단어에 딸린 예문 전부: [{ en, ko }] (한글 해석이 없는 문장은 ko 가 빈 문자열)
export function listenExamples(w) {
  const list = [];
  const seen = new Set();
  const add = (en, ko = "") => {
    const key = String(en).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push({ en: String(en).trim(), ko: String(ko || "").trim() });
  };
  for (const c of (w.colloc || []).slice().sort((a, b) => Number(b.exam) - Number(a.exam))) add(c.en, c.ko);
  for (const q of w.quizzes || (w.quiz ? [w.quiz] : [])) {
    if (q.highlight) add(q.stem, q.translation_kr);
    else if (q.answer && q.stem.includes("-------")) add(q.stem.replace("-------", q.answer));
  }
  for (const d of w.dialogue || []) add(d.en, d.ko);
  for (const x of w.examples || []) add(x.en, x.ko);
  return list;
}

// examples: 'all'(전부) | 'one'(첫 문장만) | 'off', exampleKo: 예문 뜻도 읽을지
export function buildListenSteps(w, { examples = "all", exampleKo = true, repeatWord = true } = {}) {
  const { en, ko } = listenText(w);
  const steps = [{ text: en, lang: "en-US", gap: 0.7, part: "word" }];
  if (ko) steps.push({ text: ko, lang: "ko-KR", gap: 0.8, part: "meaning" });
  let list = examples === "off" ? [] : listenExamples(w);
  if (examples === "one") list = list.slice(0, 1);
  list.forEach((ex, n) => {
    steps.push({ text: ex.en, lang: "en-US", gap: exampleKo && ex.ko ? 0.6 : 1.0, part: "example", ex: n });
    if (exampleKo && ex.ko) steps.push({ text: ex.ko, lang: "ko-KR", gap: 1.0, part: "example-ko", ex: n });
  });
  if (repeatWord && list.length) steps.push({ text: en, lang: "en-US", gap: 0.5, part: "word" });
  return steps;
}
