import { state, overallStats, dayStats, saveSettings, exportBackup, importBackup, resetProgress, localDate, syncState, syncCode, syncAvailable, createSync, linkSync, stopSync, startSync } from "../store.js";
import { esc } from "../logic.js";
import { shell, topbar, toast, confirmModal } from "../ui.js";
import { ttsSupported } from "../tts.js";

const BOX_NAME = ["아직 학습 전", "매우 자주 등장", "자주 등장", "가끔 등장", "드물게 등장", "거의 등장 안 함"];

export function stats(root) {
  const o = overallStats();
  const maxBox = Math.max(1, ...o.boxes);
  const bars = o.boxes.map((n, b) => `<div class="bar-row"><span class="bar-l">${BOX_NAME[b]}</span><span class="bar"><u class="b${b}" style="width:${(n / maxBox) * 100}%"></u></span><span class="bar-n">${n}</span></div>`).join("");

  const weeks = [...new Set(state.toc.map((t) => t.week))].map((wk) => {
    const days = state.toc.filter((t) => t.week === wk && t.available);
    if (!days.length) return `<div class="bar-row"><span class="bar-l">Week ${wk}</span><span class="bar"></span><span class="bar-n">준비 중</span></div>`;
    let total = 0, mastered = 0;
    for (const d of days) {
      const s = dayStats(d.week, d.day);
      total += s.total;
      mastered += s.mastered;
    }
    return `<div class="bar-row"><span class="bar-l">Week ${wk}</span><span class="bar"><u class="mast" style="width:${(mastered / total) * 100}%"></u></span><span class="bar-n">${mastered}/${total}</span></div>`;
  }).join("");

  const s = state.settings;
  root.innerHTML = shell(
    `${topbar({ title: "통계 · 설정" })}
     <section class="card-sec"><h2 class="sec">학습 현황</h2>
       <div class="statline big"><div><b>${state.streak.count}</b><span>연속 학습일</span></div><div><b>${o.total - o.boxes[0]}</b><span>학습한 단어</span></div><div><b>${o.mastered}</b><span>암기 완료</span></div></div>
       <h3>복습 빈도별 단어 수</h3>${bars}
       <h3>주차별 암기 진도</h3>${weeks}</section>
     <section class="card-sec"><h2 class="sec">설정</h2>
       <label class="set"><span>카드를 보여 줄 때 자동으로 발음 재생${ttsSupported() ? "" : " (이 브라우저는 미지원)"}</span><input type="checkbox" id="autoSpeak" ${s.autoSpeak ? "checked" : ""}></label>
       <label class="set"><span>발음 속도</span><select id="rate">${[[0.8, "느리게"], [0.95, "보통"], [1.1, "빠르게"]].map(([v, l]) => `<option value="${v}" ${s.rate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
       <label class="set"><span>카드 방향</span><select id="direction"><option value="en2ko" ${s.direction === "en2ko" ? "selected" : ""}>영어 → 한글</option><option value="ko2en" ${s.direction === "ko2en" ? "selected" : ""}>한글 → 영어</option></select></label>
     </section>
     ${syncSection()}
     <section class="card-sec"><h2 class="sec">학습 기록 백업</h2>
       <p class="note">PC와 휴대폰 사이에 진도를 옮기려면 한쪽에서 내보내고 다른 쪽에서 가져오세요. 같은 단어는 학습 횟수가 많은 쪽 기록이 남습니다.</p>
       <div class="btn-row"><button class="btn ghost" id="export">내보내기</button><label class="btn ghost" for="import">가져오기</label><input type="file" id="import" accept="application/json,.json" hidden></div>
       <button class="btn danger-ghost" id="reset">학습 기록 초기화</button></section>
     <p class="foot">개인 학습용 · 책의 저작권은 시원스쿨에 있습니다. 공개 배포하지 마세요.</p>`,
    "stats"
  );

  root.onchange = async (e) => {
    const t = e.target;
    if (t.id === "autoSpeak") saveSettings({ autoSpeak: t.checked });
    else if (t.id === "rate") saveSettings({ rate: +t.value });
    else if (t.id === "direction") saveSettings({ direction: t.value });
    else if (t.id === "import" && t.files[0]) {
      try {
        const n = importBackup(JSON.parse(await t.files[0].text()));
        toast(`${n}개 단어의 기록을 가져왔어요`);
        stats(root);
      } catch (err) {
        toast(err.message || "가져오기에 실패했어요");
      }
    }
  };
  root.onclick = async (e) => {
    const id = e.target.id;
    if (id === "syncNew" || id === "syncLink" || id === "syncStop") {
      const btn = e.target;
      btn.disabled = true;
      try {
        if (id === "syncNew") {
          const code = await createSync();
          startSync(() => stats(root));
          toast(`동기화 코드: ${code}`);
        } else if (id === "syncLink") {
          const n = await linkSync(document.getElementById("syncCode").value);
          startSync(() => stats(root));
          toast(`연결됐어요 · ${n}개 단어의 기록을 가져왔어요`);
        } else {
          stopSync();
          toast("동기화를 해제했어요 (이 기기의 기록은 그대로예요)");
        }
      } catch (err) {
        toast(err.message || "동기화에 실패했어요");
      }
      return stats(root);
    }
    if (e.target.id === "export") {
      const blob = new Blob([JSON.stringify(exportBackup(), null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `toeic-voca-backup-${localDate()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (e.target.id === "reset") {
      confirmModal("모든 학습 기록(복습 단계)을 지웁니다. 되돌릴 수 없어요.", () => {
        resetProgress();
        toast("학습 기록을 초기화했어요");
        stats(root);
      }, "초기화");
    }
  };
}

function syncSection() {
  if (!syncAvailable()) return "";
  const code = syncCode();
  const label = { ok: "연결됨", syncing: "동기화 중…", error: "연결 문제", off: "" }[syncState.status] || "";
  const body = code
    ? `<div class="sync-code"><span>동기화 코드</span><b>${esc(code)}</b></div>
       <p class="note">${esc(label)}${syncState.status === "error" && syncState.error ? " · " + esc(syncState.error) : ""} — 다른 기기에서 <b>통계·설정 → 코드로 연결</b>에 이 코드를 입력하세요. 학습 기록만 올라가고 책 내용은 올라가지 않아요.</p>
       <button class="btn danger-ghost" id="syncStop">동기화 해제</button>`
    : `<p class="note">PC와 휴대폰의 복습 기록을 자동으로 맞춰요. 한 기기에서 코드를 만들고, 다른 기기에서 그 코드를 입력하세요.</p>
       <button class="btn primary wide" id="syncNew">새 동기화 코드 만들기</button>
       <div class="sync-link"><input id="syncCode" placeholder="6자리 코드" maxlength="6" autocapitalize="characters" autocomplete="off"><button class="btn ghost" id="syncLink">코드로 연결</button></div>`;
  return `<section class="card-sec"><h2 class="sec">기기 간 동기화</h2>${body}</section>`;
}
