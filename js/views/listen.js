// 듣기 모드(자동재생): 단어(영) → 뜻(한) → 예문(영) → 단어(영)를 화면을 보지 않고 계속 들을 수 있게 재생.
// 운전 중에는 화면을 보지 말고 소리만 들으세요. 시작 버튼만 정차 중에 누르면 됩니다.
import { state, dayWords, dayInfo, buildReviewQueue, saveSettings } from "../store.js";
import { esc, shuffle, buildListenSteps, listenText, exampleSentence } from "../logic.js";
import { shell } from "../ui.js";
import { speakAsync, stopSpeaking, ttsSupported, hasVoice } from "../tts.js";

const POS_KEY = "toeicVoca2.listenPos";
const DEFAULTS = { shuffle: false, loop: true, example: true, pace: 1, wake: true };
const RATES = [[0.8, "느리게"], [0.95, "보통"], [1.1, "빠르게"]];

const readPos = () => {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || "{}");
  } catch {
    return {};
  }
};

function resolveScope(scope) {
  if (scope === "review") {
    const seen = new Set();
    const list = buildReviewQueue(80).filter((w) => !seen.has(w.id) && seen.add(w.id));
    return { title: "복습 듣기", words: list, back: "#/" };
  }
  let m = scope.match(/^day-(\d+)-(\d+)$/);
  if (m) {
    const info = dayInfo(+m[1], +m[2]);
    return info?.available ? { title: `Week ${m[1]} · Day ${m[2]}`, sub: info.title, words: dayWords(+m[1], +m[2]), back: `#/day/${m[1]}/${m[2]}` } : null;
  }
  m = scope.match(/^week-(\d+)$/);
  if (m) {
    const ws = state.words.filter((w) => w.week === +m[1]).sort((a, b) => a.day - b.day || a.no - b.no);
    return ws.length ? { title: `Week ${m[1]} 전체`, sub: `${ws.length}단어`, words: ws, back: "#/" } : null;
  }
  return null;
}

// 소리 없는 오디오를 계속 틀어 두면 모바일에서 화면이 꺼져도 미디어 세션이 유지되는 경우가 많음
function silentWavUrl() {
  const sr = 8000, n = sr;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

export function listen(root, [scope]) {
  const sc = resolveScope(scope);
  if (!sc || !sc.words.length) {
    root.innerHTML = shell(`<header class="topbar"><a class="icon-btn" href="#/">‹</a><div class="tb-title"><h1>듣기</h1></div></header>
      <p class="empty">들을 단어가 아직 없어요.<br>먼저 Day를 골라 카드 학습을 해 보세요.</p>`, "home");
    return;
  }
  const opts = { ...DEFAULTS, ...(state.settings.listen || {}) };
  const sequential = scope !== "review";
  let queue = opts.shuffle ? shuffle(sc.words) : sc.words.slice();
  const savedPos = sequential ? readPos()[scope] || 0 : 0;
  let index = !opts.shuffle && savedPos > 0 && savedPos < queue.length ? savedPos : 0;
  let gen = 0, playing = false, started = false;
  let audio = null, lock = null;

  const persistOpts = () => saveSettings({ listen: { ...opts } });
  const savePos = () => {
    if (!sequential || opts.shuffle) return;
    const all = readPos();
    all[scope] = index;
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  };

  // ---------- 화면 ----------
  const speedLabel = () => RATES.find(([r]) => r === state.settings.rate)?.[1] || "보통";
  const chip = (id, on, label) => `<button class="lchip${on ? " on" : ""}" id="${id}" aria-pressed="${on}">${label}</button>`;

  function draw() {
    const w = queue[index];
    root.innerHTML = shell(
      `<div class="listen">
        <div class="l-top"><a class="icon-btn" href="${sc.back}" aria-label="나가기">✕</a>
          <div class="l-title"><b>${esc(sc.title)}</b>${sc.sub ? `<span>${esc(sc.sub)}</span>` : ""}</div>
          <span class="l-count" id="lc">${index + 1}/${queue.length}</span></div>
        <div class="l-progress"><u id="lp" style="width:${((index + 1) / queue.length) * 100}%"></u></div>
        <div class="l-stage" id="stage">${stageHtml(w)}</div>
        <div class="l-ctrl">
          <button class="lbtn" id="prev" aria-label="이전 단어">⏮</button>
          <button class="lbtn big" id="toggle" aria-label="${playing ? "일시정지" : "재생"}">${playing ? "⏸" : "▶"}</button>
          <button class="lbtn" id="next" aria-label="다음 단어">⏭</button>
        </div>
        ${started ? "" : `<p class="l-note">▶를 누르면 자동으로 이어서 들려줘요. 운전 중에는 화면을 보지 말고 소리만 들으세요.${ttsSupported() ? "" : "<br>이 브라우저는 음성 읽기를 지원하지 않아요."}${hasVoice("ko-KR") ? "" : "<br>한국어 음성이 없어 뜻을 읽지 못할 수 있어요."}</p>`}
        <div class="l-opts">
          ${chip("oShuffle", opts.shuffle, "🔀 섞기")}${chip("oLoop", opts.loop, "🔁 반복")}${chip("oEx", opts.example, "💬 예문")}${chip("oWake", opts.wake, "☀️ 화면 켜두기")}
          <button class="lchip" id="oRate">🐢 ${speedLabel()}</button>
          <button class="lchip" id="oPace">⏱ 간격 ${opts.pace === 1 ? "보통" : opts.pace > 1 ? "길게" : "짧게"}</button>
        </div>
      </div>`,
      "home",
      false
    );
  }

  const stageHtml = (w) => {
    const { en, ko } = listenText(w);
    const ex = opts.example ? exampleSentence(w) : null;
    return `<p class="l-en" id="lw">${esc(en)}</p><p class="l-ko" id="lm">${esc(ko)}</p>${ex ? `<p class="l-ex" id="lx">${esc(ex)}</p>` : ""}`;
  };

  function showWord() {
    const w = queue[index];
    root.querySelector("#stage").innerHTML = stageHtml(w);
    root.querySelector("#lc").textContent = `${index + 1}/${queue.length}`;
    root.querySelector("#lp").style.width = `${((index + 1) / queue.length) * 100}%`;
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: listenText(w).en, artist: listenText(w).ko, album: sc.title });
    }
  }

  function setToggle() {
    const b = root.querySelector("#toggle");
    if (!b) return;
    b.textContent = playing ? "⏸" : "▶";
    b.setAttribute("aria-label", playing ? "일시정지" : "재생");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }

  // ---------- 재생 엔진 ----------
  const sleep = (ms, my) =>
    new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => (my !== gen || Date.now() - t0 >= ms ? resolve() : setTimeout(tick, 80));
      tick();
    });

  async function playFrom(i) {
    const my = ++gen;
    stopSpeaking();
    index = i;
    playing = true;
    started = true;
    startKeepAlive();
    await acquireLock();
    root.querySelector(".l-note")?.remove();
    setToggle();
    while (my === gen) {
      showWord();
      savePos();
      const w = queue[index];
      for (const st of buildListenSteps(w, { example: opts.example })) {
        if (my !== gen) return;
        await speakAsync(st.text, st.lang, st.lang === "ko-KR" ? Math.min(state.settings.rate + 0.05, 1.15) : state.settings.rate);
        if (my !== gen) return;
        await sleep(st.gap * opts.pace * 1000, my);
      }
      if (my !== gen) return;
      index++;
      if (index >= queue.length) {
        if (!opts.loop) {
          index = queue.length - 1;
          return finish();
        }
        index = 0;
        if (opts.shuffle) queue = shuffle(sc.words);
      }
    }
  }

  function pause() {
    gen++;
    stopSpeaking();
    playing = false;
    setToggle();
    audio?.pause();
    releaseLock();
  }

  function finish() {
    playing = false;
    setToggle();
    audio?.pause();
    releaseLock();
    if (sequential) {
      index = 0;
      savePos();
    }
    root.querySelector(".l-stage").innerHTML = `<p class="l-en">끝까지 들었어요 🎉</p><p class="l-ko">▶를 누르면 처음부터 다시 들려줘요</p>`;
  }

  const go = (d) => {
    const next = (index + d + queue.length) % queue.length;
    if (playing) playFrom(next);
    else {
      gen++;
      stopSpeaking();
      index = next;
      showWord();
      savePos();
    }
  };
  const toggle = () => (playing ? pause() : playFrom(index));

  // ---------- 백그라운드 유지(오디오·미디어 세션·화면 켜두기) ----------
  function startKeepAlive() {
    if (!audio) {
      audio = new Audio(silentWavUrl());
      audio.loop = true;
      audio.volume = 0.01;
    }
    audio.play().catch(() => {});
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler("play", () => playFrom(index));
      ms.setActionHandler("pause", pause);
      ms.setActionHandler("nexttrack", () => go(1));
      ms.setActionHandler("previoustrack", () => go(-1));
    }
  }
  async function acquireLock() {
    if (!opts.wake || lock || !navigator.wakeLock) return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } catch {}
  }
  function releaseLock() {
    lock?.release?.().catch?.(() => {});
    lock = null;
  }
  const onVisible = () => document.visibilityState === "visible" && playing && acquireLock();
  document.addEventListener("visibilitychange", onVisible);

  // ---------- 입력 ----------
  root.onclick = (e) => {
    const id = e.target.closest("button")?.id;
    if (!id) return;
    if (id === "toggle") toggle();
    else if (id === "next") go(1);
    else if (id === "prev") go(-1);
    else if (["oShuffle", "oLoop", "oEx", "oWake"].includes(id)) {
      const key = { oShuffle: "shuffle", oLoop: "loop", oEx: "example", oWake: "wake" }[id];
      opts[key] = !opts[key];
      persistOpts();
      if (key === "shuffle") {
        queue = opts.shuffle ? shuffle(sc.words) : sc.words.slice();
        index = 0;
      }
      if (key === "wake") opts.wake ? acquireLock() : releaseLock();
      const wasPlaying = playing;
      draw();
      if (wasPlaying) playFrom(index);
    } else if (id === "oRate") {
      const i = RATES.findIndex(([r]) => r === state.settings.rate);
      saveSettings({ rate: RATES[(i + 1) % RATES.length][0] });
      e.target.textContent = `🐢 ${speedLabel()}`;
    } else if (id === "oPace") {
      opts.pace = opts.pace === 1 ? 1.6 : opts.pace > 1 ? 0.6 : 1;
      persistOpts();
      e.target.textContent = `⏱ 간격 ${opts.pace === 1 ? "보통" : opts.pace > 1 ? "길게" : "짧게"}`;
    }
  };

  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.target.tagName === "INPUT") return;
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Escape") location.hash = sc.back;
  };
  document.addEventListener("keydown", onKey);

  draw();

  return () => {
    gen++;
    stopSpeaking();
    audio?.pause();
    audio = null;
    releaseLock();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisible);
    if ("mediaSession" in navigator) {
      for (const a of ["play", "pause", "nexttrack", "previoustrack"]) {
        try {
          navigator.mediaSession.setActionHandler(a, null);
        } catch {}
      }
      navigator.mediaSession.playbackState = "none";
    }
  };
}
