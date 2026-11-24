// 브라우저 내장 음성(Web Speech API)으로 영어를 읽어 주는 모듈
import { speakable } from "./logic.js";
import { state } from "./store.js";

let voices = [];
function loadVoices() {
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

// 자연스러운 음성(Natural/Online/Google 등)을 우선 선택
function pickEnglishVoice() {
  const en = voices.filter((v) => /^en[-_]US/i.test(v.lang));
  const score = (v) => (/natural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return en.sort((a, b) => score(b) - score(a))[0] || voices.find((v) => /^en/i.test(v.lang)) || null;
}

export const ttsSupported = () => !!window.speechSynthesis;

export function speak(text, { lang = "en-US" } = {}) {
  if (!ttsSupported()) return;
  const clean = speakable(text);
  if (!clean) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  u.rate = state.settings.rate || 1;
  const v = lang.startsWith("en") ? pickEnglishVoice() : null;
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
