// 공통 UI: 화면 틀(하단 탭), 토스트, 확인 창
import { esc } from "./logic.js";

export const root = document.getElementById("app");

let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

export function confirmModal(message, onOk, okLabel = "확인") {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="modal-actions"><button class="btn ghost" data-m="cancel">취소</button><button class="btn danger" data-m="ok">${esc(okLabel)}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    const m = e.target.dataset.m;
    if (m === "ok") onOk();
    if (m || e.target === overlay) overlay.remove();
  });
}

const TABS = [
  ["home", "#/", "홈", "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  ["review", "#/study/review", "복습", "M4 4v6h6M20 20v-6h-6M20 10a8 8 0 0 0-14-3L4 10M4 14a8 8 0 0 0 14 3l2-3"],
  ["stats", "#/stats", "통계·설정", "M5 20V10M12 20V4M19 20v-7"],
];

// 화면 본문을 감싸 하단 탭을 붙임 (active: 현재 탭 이름, nav=false 면 탭 없음)
export function shell(inner, active, nav = true) {
  const tabs = TABS.map(
    ([id, href, label, path]) =>
      `<a href="${href}" class="tab${id === active ? " on" : ""}" ${id === active ? 'aria-current="page"' : ""}>
         <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>
         <span>${label}</span></a>`
  ).join("");
  return `<div class="page">${inner}</div>${nav ? `<nav class="tabbar">${tabs}</nav>` : ""}`;
}

export function topbar({ title, sub = "", back = null, right = "" }) {
  const backBtn = back ? `<a class="icon-btn" href="${back}" aria-label="뒤로">‹</a>` : "";
  return `<header class="topbar">${backBtn}<div class="tb-title"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>${right}</header>`;
}
