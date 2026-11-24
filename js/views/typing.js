// 타이핑 학습: 키보드로 직접 쳐서 외우기 (PC에서 특히 편함). Enter 로 확인·다음.
//   뜻 보고 쓰기 / 빈칸 문장 쓰기 / 보고 따라 쓰기
// 결과는 카드 학습과 같은 복습 단계(SRS)에 반영: 한 번에 정답 4점, 힌트·오타 3점, 오답 0점
import { state, dayWords, dayInfo, buildReviewQueue, rate } from "../store.js";
import { esc, shuffle, typingTargets, gradeTyping, makeCloze, exampleSentence } from "../logic.js";
import { shell } from "../ui.js";
import { posBadge, sayBtn } from "../render.js";
import { speak } from "../tts.js";

const MODES = {
  meaning: { icon: "✍️", name: "뜻 보고 단어 쓰기", desc: "한글 뜻을 보고 영어 단어·표현을 직접 칩니다." },
  cloze: { icon: "🧩", name: "빈칸 문장 쓰기", desc: "예문 속 빈칸에 들어갈 말을 칩니다. 활용형(-ed, -s 등)까지 맞춰야 해요." },
  copy: { icon: "👀", name: "보고 따라 쓰기", desc: "단어와 예문을 눈으로 보면서 그대로 칩니다. 처음 외울 때 좋아요." },
};

function resolve(scope) {
  if (scope === "review") return { title: "복습 타이핑", words: shuffle(buildReviewQueue(40).filter((w, i, a) => a.findIndex((x) => x.id === w.id) === i)), back: "#/" };
  const m = scope.match(/^day-(\d+)-(\d+)$/);
  const info = m && dayInfo(+m[1], +m[2]);
  return info?.available ? { title: `Week ${m[1]} · Day ${m[2]}`, words: dayWords(+m[1], +m[2]), back: `#/day/${m[1]}/${m[2]}` } : null;
}

export function typing(root, [scope, mode]) {
  const sc = resolve(scope);
  if (!sc || !sc.words.length) {
    root.innerHTML = shell(`<header class="topbar"><a class="icon-btn" href="#/">‹</a><div class="tb-title"><h1>타이핑</h1></div></header>
      <p class="empty">연습할 단어가 아직 없어요.<br>먼저 Day를 골라 카드 학습을 해 보세요.</p>`, "home");
    return;
  }

  // ---------- 시작 화면: 방식 고르기 ----------
  if (!MODES[mode]) {
    root.innerHTML = shell(
      `<header class="topbar"><a class="icon-btn" href="${sc.back}" aria-label="뒤로">‹</a><div class="tb-title"><h1>타이핑 학습</h1><p>${esc(sc.title)} · ${sc.words.length}단어</p></div></header>
       <div class="t-modes">${Object.entries(MODES)
         .map(([k, m]) => `<a class="t-mode" href="#/typing/${scope}/${k}"><span class="t-ico">${m.icon}</span><div><b>${m.name}</b><p>${m.desc}</p></div></a>`)
         .join("")}</div>
       <p class="note" style="margin-top:14px">⌨️ Enter 로 확인하고 다음으로 넘어가요. 한/영 키가 한글로 돼 있으면 영어로 바꿔 주세요. 대소문자·띄어쓰기·하이픈은 틀려도 괜찮아요.</p>`,
      "home"
    );
    return;
  }

  // ---------- 세션 ----------
  let queue = scope === "review" ? sc.words : sc.words.slice();
  let i = 0;
  let phase = "ask"; // ask → (fix) → next
  let hinted = false, tries = 0, missed = false;
  const resolved = new Set(); // 이미 점수를 기록한 단어
  const tally = { clean: 0, assisted: 0, wrong: 0 };
  const wrongWords = [];

  const build = (w) => {
    const cloze = mode === "cloze" ? makeCloze(w) : null;
    if (cloze) return { w, kind: "cloze", targets: [cloze.answer], cloze };
    return { w, kind: mode === "copy" ? "copy" : "meaning", targets: typingTargets(w.headword) };
  };

  function promptHtml(it) {
    const { w } = it;
    if (it.kind === "cloze")
      return `<p class="t-cloze">${esc(it.cloze.sentence).replace("______", '<span class="blank"></span>')}</p><p class="t-hint">${esc(it.cloze.hint)}</p>`;
    if (it.kind === "copy") {
      const ex = exampleSentence(w);
      return `<p class="t-word">${esc(w.headword)} ${posBadge(w.pos)} ${sayBtn(it.targets[0])}</p><p class="t-hint">${esc(w.meaning)}</p>${ex ? `<p class="t-ex">${esc(ex)}</p>` : ""}`;
    }
    return `<p class="t-ko">${esc(w.meaning)} ${posBadge(w.pos)}</p>`;
  }

  function render(msg = "", tone = "") {
    if (i >= queue.length) return finish();
    const it = build(queue[i]);
    const label = phase === "fix" ? "정답을 한 번 직접 쳐 보세요" : phase === "next" ? "" : it.kind === "copy" ? "위의 단어를 그대로 쳐 보세요" : "영어로 입력";
    root.innerHTML = shell(
      `<div class="session">
        <div class="s-top"><a class="icon-btn" href="${sc.back}" aria-label="그만두기">✕</a>
          <div class="progress"><u style="width:${Math.round((i / queue.length) * 100)}%"></u></div><span class="s-count">${i + 1}/${queue.length}</span></div>
        <div class="q-card t-card">${promptHtml(it)}</div>
        <form id="tf" class="t-form" autocomplete="off">
          ${phase === "next" ? "" : `<input id="ti" class="t-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${label}" aria-label="${label}">`}
          <div class="t-msg ${tone}" id="tm" role="status">${msg}</div>
          <div class="t-btns">
            ${phase === "ask" ? `<button type="button" class="btn ghost" id="hint">힌트</button><button type="button" class="btn ghost" id="show">정답 보기</button>` : ""}
            <button type="submit" class="btn primary" id="go">${phase === "next" ? "다음 <kbd>Enter</kbd>" : "확인 <kbd>Enter</kbd>"}</button>
          </div>
        </form>
      </div>`,
      "home",
      false
    );
    const input = root.querySelector("#ti");
    (input || root.querySelector("#go")).focus();
  }

  const answerOf = (it) => it.targets[0];
  const advance = () => {
    i++;
    phase = "ask";
    hinted = false;
    tries = 0;
    missed = false;
    render();
  };

  function record(it, q, bucket) {
    if (resolved.has(it.w.id)) return;
    resolved.add(it.w.id);
    rate(it.w.id, q);
    tally[bucket]++;
    if (bucket === "wrong") wrongWords.push(it.w);
  }

  function fail(it) {
    record(it, 0, "wrong");
    missed = true;
    phase = "fix";
    // 틀린 단어는 4문제 뒤에 한 번 더 (같은 단어가 이미 뒤에 있으면 추가하지 않음)
    if (!queue.slice(i + 1).some((x) => x.id === it.w.id)) queue.splice(Math.min(i + 5, queue.length), 0, it.w);
    render(`정답: <b>${esc(answerOf(it))}</b>`, "bad");
  }

  function submit(e) {
    e.preventDefault();
    const it = build(queue[i]);
    if (phase === "next") return advance();
    const val = root.querySelector("#ti").value;
    const g = gradeTyping(val, it.targets);
    if (g.result === "ime") return render("한/영 키가 한글로 되어 있어요. 영어로 바꿔 주세요.", "warn");
    if (!val.trim()) return;

    if (phase === "fix") {
      if (g.result === "exact") {
        phase = "next";
        return render(`좋아요! <b>${esc(answerOf(it))}</b> ${sayBtn(answerOf(it), "sm")}`, "ok");
      }
      return render(`정답: <b>${esc(answerOf(it))}</b> — 그대로 쳐 보세요`, "bad");
    }

    tries++;
    if (g.result === "exact") {
      record(it, hinted || tries > 1 ? 3 : 4, hinted || tries > 1 ? "assisted" : "clean");
      phase = "next";
      if (state.settings.autoSpeak) speak(answerOf(it));
      return render(`정답이에요! 👍 <b>${esc(answerOf(it))}</b> ${sayBtn(answerOf(it), "sm")}${it.kind === "cloze" ? `<br><span class="t-full">${esc(it.cloze.sentence.replace("______", answerOf(it)))}</span>` : ""}`, "ok");
    }
    if (g.result === "near" && tries < 3) {
      hinted = true; // 오타는 3점 처리
      return render("거의 맞았어요! 철자를 다시 확인해 보세요.", "warn");
    }
    fail(it);
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const it = build(queue[i]);
    if (b.id === "again") {
      queue = scope === "review" ? shuffle(queue.filter((w, n, a) => a.findIndex((x) => x.id === w.id) === n)) : sc.words.slice();
      i = 0;
      phase = "ask";
      hinted = false;
      tries = 0;
      missed = false;
      resolved.clear();
      wrongWords.length = 0;
      tally.clean = tally.assisted = tally.wrong = 0;
      return render();
    }
    if (b.id === "hint") {
      hinted = true;
      const a = answerOf(it);
      const cur = root.querySelector("#ti").value;
      render(`힌트: <b>${esc(a.slice(0, Math.min(a.length, 1 + Math.max(0, Math.floor(a.length / 3)))))}…</b> (${a.length}글자)`, "warn");
      root.querySelector("#ti").value = cur;
    } else if (b.id === "show") {
      fail(it);
    }
  }

  function finish() {
    const total = tally.clean + tally.assisted + tally.wrong;
    root.innerHTML = shell(
      `<div class="done"><p class="done-emoji">${tally.wrong === 0 ? "🏆" : tally.clean >= total / 2 ? "👏" : "💪"}</p><h2>${esc(sc.title)} 타이핑 완료</h2>
        <p class="done-sub">${MODES[mode].name} · ${total}단어</p>
        <div class="tally"><div class="easy"><b>${tally.clean}</b>한 번에</div><div class="hard"><b>${tally.assisted}</b>힌트·오타</div><div class="again"><b>${tally.wrong}</b>틀림</div></div>
        ${wrongWords.length ? `<div class="wrong-list"><h4>틀린 단어</h4>${wrongWords.map((w) => `<a href="#/word/${esc(w.id)}"><b>${esc(w.headword)}</b><span>${esc(w.meaning)}</span></a>`).join("")}</div>` : ""}
        <div class="done-actions"><button class="btn primary wide" id="again">한 번 더</button>
          <a class="btn ghost wide" href="#/typing/${scope}">다른 방식으로</a><a class="btn ghost wide" href="${sc.back}">돌아가기</a></div></div>`,
      "home",
      false
    );
  }

  root.onclick = onClick;
  root.addEventListener("submit", submit);
  const onKey = (e) => e.key === "Escape" && (location.hash = sc.back);
  document.addEventListener("keydown", onKey);
  render();
  return () => {
    root.removeEventListener("submit", submit);
    document.removeEventListener("keydown", onKey);
  };
}
