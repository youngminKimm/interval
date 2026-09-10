"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LABEL = { prepare: "준비", work: "운동", rest: "휴식", setrest: "세트 휴식", done: "완료" };
const CIRC = 2 * Math.PI * 45; // ring 둘레

// 대중적인 운동 목록 (탭해서 추가)
const POPULAR = [
  "점핑잭", "버피", "스쿼트", "런지", "푸시업", "마운틴 클라이머",
  "하이니", "플랭크", "크런치", "레그레이즈", "글루트 브릿지", "사이드 플랭크"
];

// ---------------- 설정 ----------------
const FIELDS = ["prepare", "work", "rest", "rounds", "sets", "setrest"];
let exercises = []; // [{name, dur}] — 비어 있으면 단일 "운동" 모드
let exDurMemo = {}; // 운동 이름 → 마지막 사용 시간 (삭제 후 재추가 시 복원)

function readForm() {
  const cfg = {};
  for (const f of FIELDS) {
    const el = $("#" + f);
    let v = parseInt(el.value, 10);
    if (isNaN(v)) v = parseInt(el.min, 10) || 0;
    v = Math.max(parseInt(el.min, 10) || 0, Math.min(parseInt(el.max, 10) || 9999, v));
    cfg[f] = v; // 타이핑 중에는 입력창을 건드리지 않는다 (blur 시 정리)
  }
  cfg.exercises = exercises.map(e => ({ name: e.name, dur: e.dur }));
  return cfg;
}
function writeForm(cfg) {
  for (const f of FIELDS) if (cfg[f] != null) $("#" + f).value = cfg[f];
  if (Array.isArray(cfg.exercises)) { exercises = cfg.exercises; renderExList(); }
  updateTotal();
}
function saveSettings() {
  const opts = { sound: $("#optSound").checked, voice: $("#optVoice").checked, wake: $("#optWake").checked };
  localStorage.setItem("interval.cfg", JSON.stringify({ ...readForm(), ...opts, exmem: exDurMemo, v: 2 }));
}
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("interval.cfg"));
    if (!saved) return;
    writeForm(saved);
    if (saved.exmem) exDurMemo = saved.exmem;
    if (saved.sound != null) $("#optSound").checked = saved.sound;
    // v2 이전 저장본은 음성 안내가 기본 꺼짐이었으므로 한 번 켜 준다
    if (saved.v >= 2 && saved.voice != null) $("#optVoice").checked = saved.voice;
    if (saved.wake != null) $("#optWake").checked = saved.wake;
  } catch (e) { /* 무시 */ }
}

// ---------------- 운동 구성 UI ----------------
function renderExList() {
  const list = $("#exList");
  list.innerHTML = "";
  exercises.forEach((ex, i) => {
    const row = document.createElement("div");
    row.className = "ex-row";
    row.dataset.idx = i;
    row.innerHTML =
      '<span class="mini handle" title="드래그해서 순서 변경">⠿</span>' +
      '<span class="ex-name"></span>' +
      '<button type="button" class="mini" data-act="minus" data-i="' + i + '">−</button>' +
      '<span class="ex-dur">' + ex.dur + '<small>초</small></span>' +
      '<button type="button" class="mini" data-act="plus" data-i="' + i + '">+</button>' +
      '<button type="button" class="mini del" data-act="del" data-i="' + i + '">×</button>';
    row.querySelector(".ex-name").textContent = (i + 1) + ". " + ex.name;
    list.appendChild(row);
  });
  // 목록이 있으면 공통 "운동 (초)" 필드는 의미 없으므로 숨김
  $("#workField").style.display = exercises.length ? "none" : "";
}
function addExercise(name) {
  name = name.trim();
  if (!name || exercises.length >= 20) return;
  exercises.push({ name, dur: exDurMemo[name] || parseInt($("#work").value, 10) || 30 });
  renderExList(); updateTotal(); saveSettings();
}
$("#exList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const i = parseInt(btn.dataset.i, 10), act = btn.dataset.act;
  if (act === "del") { exDurMemo[exercises[i].name] = exercises[i].dur; exercises.splice(i, 1); }
  else if (act === "minus") exercises[i].dur = Math.max(5, exercises[i].dur - 5);
  else if (act === "plus") exercises[i].dur = Math.min(600, exercises[i].dur + 5);
  if (act === "minus" || act === "plus") exDurMemo[exercises[i].name] = exercises[i].dur;
  renderExList(); updateTotal(); saveSettings();
});
// 드래그로 순서 변경 (포인터 이벤트 — 터치/마우스 공용)
let drag = null;
$("#exList").addEventListener("pointerdown", (e) => {
  const h = e.target.closest(".handle");
  if (!h) return;
  e.preventDefault();
  drag = { row: h.closest(".ex-row") };
  drag.row.classList.add("dragging");
  try { h.setPointerCapture(e.pointerId); } catch (err) {}
});
$("#exList").addEventListener("pointermove", (e) => {
  if (!drag) return;
  const list = $("#exList");
  const others = [...list.children].filter(r => r !== drag.row);
  const before = others.find(r => {
    const b = r.getBoundingClientRect();
    return e.clientY < b.top + b.height / 2;
  });
  if (before) list.insertBefore(drag.row, before);
  else list.appendChild(drag.row);
});
function endDrag() {
  if (!drag) return;
  drag.row.classList.remove("dragging");
  const order = [...$("#exList").children].map(r => parseInt(r.dataset.idx, 10));
  exercises = order.map(i => exercises[i]);
  drag = null;
  renderExList(); updateTotal(); saveSettings();
}
$("#exList").addEventListener("pointerup", endDrag);
$("#exList").addEventListener("pointercancel", endDrag);

$("#exAddBtn").addEventListener("click", () => { addExercise($("#exName").value); $("#exName").value = ""; });
$("#exName").addEventListener("keydown", (e) => {
  if (e.code === "Enter") { e.preventDefault(); addExercise($("#exName").value); $("#exName").value = ""; }
});
// 인기 운동 칩
POPULAR.forEach(name => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = "+ " + name;
  b.addEventListener("click", () => addExercise(name));
  $("#exChips").appendChild(b);
});

// ---------------- 페이즈 시퀀스 ----------------
function buildPhases(cfg) {
  const exs = cfg.exercises && cfg.exercises.length ? cfg.exercises : [{ name: null, dur: cfg.work }];
  const p = [];
  if (cfg.prepare > 0) p.push({ type: "prepare", dur: cfg.prepare, round: 1, set: 1 });
  for (let s = 1; s <= cfg.sets; s++) {
    for (let r = 1; r <= cfg.rounds; r++) {
      exs.forEach((ex, i) => {
        p.push({ type: "work", dur: ex.dur, name: ex.name, round: r, set: s, exNo: i + 1, exTotal: exs.length });
        const lastInSet = r === cfg.rounds && i === exs.length - 1;
        if (!lastInSet && cfg.rest > 0) p.push({ type: "rest", dur: cfg.rest, round: r, set: s });
      });
    }
    if (s < cfg.sets && cfg.setrest > 0) p.push({ type: "setrest", dur: cfg.setrest, round: cfg.rounds, set: s });
  }
  return p;
}
const totalSec = (phases) => phases.reduce((a, p) => a + p.dur, 0);
const workName = (ph) => ph.name || "운동";

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}
function updateTotal() {
  const phases = buildPhases(readForm());
  $("#totalTime").textContent = fmt(totalSec(phases));
}

// ---------------- 오디오 (Web Audio — 오디오 클록에 미리 스케줄) ----------------
// 백그라운드 탭에서 JS 타이머는 지연되지만 AudioContext 클록은 정확하므로,
// 시작/재개 시점에 남은 전체 구간의 비프음을 전부 예약해 둔다.
let ac = null;
let scheduledNodes = [];
let silentEl = null;

// iOS 무음(진동) 스위치 대응: 무음 <audio>를 루프 재생해 오디오 세션을
// 미디어 재생 모드로 전환하면 Web Audio가 무음 스위치를 무시하고 소리를 낸다.
function silentWavURL() {
  const rate = 8000, n = rate / 2, size = 44 + n * 2;
  const b = new DataView(new ArrayBuffer(size));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); b.setUint32(4, size - 8, true); w(8, "WAVEfmt ");
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true);
  b.setUint16(32, 2, true); b.setUint16(34, 16, true);
  w(36, "data"); b.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b.buffer], { type: "audio/wav" }));
}
function ensurePlaybackSession() {
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
  if (!silentEl) {
    silentEl = new Audio(silentWavURL());
    silentEl.loop = true;
    silentEl.setAttribute("playsinline", "");
  }
  silentEl.play().catch(() => {});
}
function releasePlaybackSession() {
  if (silentEl) silentEl.pause();
}

function audioCtx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === "suspended") ac.resume();
  return ac;
}
function beepAt(t, freq, dur = 0.15, vol = 0.9) {
  const ctx = audioCtx();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
  scheduledNodes.push(o);
  o.onended = () => { scheduledNodes = scheduledNodes.filter(n => n !== o); };
}
function cancelScheduledAudio() {
  for (const o of scheduledNodes) { try { o.stop(0); } catch (e) {} }
  scheduledNodes = [];
}
// 페이즈 시작음
function startSoundAt(t, type) {
  if (type === "work") { beepAt(t, 1320, 0.4, 1); }
  else if (type === "done") { beepAt(t, 660, 0.15); beepAt(t + 0.18, 880, 0.15); beepAt(t + 0.36, 1175, 0.5); }
  else { beepAt(t, 587, 0.3, 0.85); } // rest / setrest / prepare
}
// 현재 위치부터 끝까지 모든 소리 예약
function scheduleAllAudio() {
  cancelScheduledAudio();
  if (!$("#optSound").checked) return;
  const ctx = audioCtx();
  const now = ctx.currentTime + 0.05;
  let offset = (state.phaseEndsAt - performance.now()) / 1000; // 현재 페이즈 남은 시간
  let budget = 1500; // 노드 수 상한

  // 현재 페이즈의 카운트다운
  for (let n = 3; n >= 1; n--) {
    if (offset > n) beepAt(now + offset - n, 880, 0.1, 0.7);
  }
  for (let i = state.idx + 1; i < state.phases.length && budget > 0; i++) {
    const ph = state.phases[i];
    startSoundAt(now + offset, ph.type); budget -= 2;
    for (let n = 3; n >= 1; n--) {
      if (ph.dur > n + 1) { beepAt(now + offset + ph.dur - n, 880, 0.1, 0.7); budget--; }
    }
    offset += ph.dur;
  }
  startSoundAt(now + offset, "done");
}

// ---------------- 음성 안내 ----------------
// OS 기본 TTS (기기에 설치된 한국어 목소리 사용)
function stopVoice() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function speakParts(parts) {
  if (!$("#optVoice").checked || !("speechSynthesis" in window)) return;
  stopVoice();
  const u = new SpeechSynthesisUtterance(parts.join(". "));
  u.lang = "ko-KR";
  const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("ko"));
  if (v) u.voice = v;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
// 현재 인덱스 이후의 첫 번째 운동 페이즈
function nextWorkAfter(idx) {
  for (let i = idx + 1; i < state.phases.length; i++) {
    if (state.phases[i].type === "work") return state.phases[i];
  }
  return null;
}
// 페이즈별 안내 멘트 (클립 문장과 정확히 일치해야 함)
function annParts(ph, idx) {
  if (!ph) return ["운동 완료. 수고하셨습니다"];
  if (ph.type === "prepare") {
    const first = nextWorkAfter(idx);
    return [first && first.name ? "준비하세요. 첫 운동은 " + first.name : "준비하세요. 곧 시작합니다"];
  }
  if (ph.type === "work") {
    const parts = [];
    if (ph.exNo === 1) parts.push(ph.round + "라운드");
    parts.push(ph.name ? ph.name + " 시작" : "운동 시작");
    return parts;
  }
  if (ph.type === "rest") {
    const next = nextWorkAfter(idx);
    return [next && next.name ? "휴식. 다음은 " + next.name : "휴식"];
  }
  if (ph.type === "setrest") return ["세트 휴식"];
  return [LABEL[ph.type]];
}
function announce(ph) { speakParts(annParts(ph, state.idx)); }

// ---------------- Wake Lock ----------------
let wakeLock = null;
async function requestWake() {
  if (!$("#optWake").checked || !("wakeLock" in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.running) requestWake();
});

// ---------------- 타이머 상태 ----------------
const state = {
  phases: [], idx: 0,
  running: false, done: false,
  phaseEndsAt: 0,   // performance.now() 기준 현재 페이즈 종료 시각
  pausedRemain: 0,  // 일시정지 시 남은 ms
  elapsedBefore: 0, // 지난 페이즈들의 누적 초
  total: 0,
  timer: null,
};

function startWorkout() {
  const cfg = readForm();
  state.phases = buildPhases(cfg);
  if (!state.phases.length) return;
  state.idx = 0;
  state.done = false;
  state.total = totalSec(state.phases);
  state.elapsedBefore = 0;
  saveSettings();

  $("#setup").hidden = true;
  $("#run").hidden = false;
  $("#totalLabel").textContent = fmt(state.total);

  audioCtx();             // 사용자 제스처 안에서 활성화
  ensurePlaybackSession(); // iOS 무음 스위치 대응
  enterPhase(0, state.phases[0].dur * 1000);
  resume(true);
}

function enterPhase(idx, remainMs) {
  state.idx = idx;
  state.phaseEndsAt = performance.now() + remainMs;
  state.elapsedBefore = state.phases.slice(0, idx).reduce((a, p) => a + p.dur, 0);
  document.body.dataset.phase = state.phases[idx].type;
  render();
}

function resume(isStart = false) {
  state.running = true;
  document.body.classList.remove("paused");
  $("#pauseBtn").textContent = "⏸";
  if (!isStart) state.phaseEndsAt = performance.now() + state.pausedRemain;
  ensurePlaybackSession();
  scheduleAllAudio();
  if (isStart) announce(state.phases[0]);
  requestWake();
  clearInterval(state.timer);
  state.timer = setInterval(tick, 100);
  tick();
}
function pause() {
  state.running = false;
  state.pausedRemain = Math.max(0, state.phaseEndsAt - performance.now());
  document.body.classList.add("paused");
  $("#pauseBtn").textContent = "▶";
  cancelScheduledAudio();
  stopVoice();
  clearInterval(state.timer);
  releaseWake();
}
function stopWorkout() {
  cancelScheduledAudio();
  stopVoice();
  clearInterval(state.timer);
  speechSynthesis?.cancel?.();
  state.running = false;
  state.done = false;
  document.body.classList.remove("paused");
  document.body.dataset.phase = "idle";
  releaseWake();
  releasePlaybackSession();
  $("#run").hidden = true;
  $("#setup").hidden = false;
}

function tick() {
  if (!state.running) return;
  let remain = state.phaseEndsAt - performance.now();
  // 백그라운드에서 늦게 깨어난 경우 여러 페이즈를 건너뛸 수 있음
  while (remain <= 0) {
    if (state.idx + 1 >= state.phases.length) { finish(); return; }
    const carry = remain; // 음수(초과분) 이월 → 장기적으로 오차 없음
    const next = state.phases[state.idx + 1];
    enterPhase(state.idx + 1, next.dur * 1000 + carry);
    announce(next);
    remain = state.phaseEndsAt - performance.now();
  }
  render(remain);
}

function finish() {
  clearInterval(state.timer);
  state.running = false;
  state.done = true;
  document.body.dataset.phase = "done";
  $("#phaseLabel").textContent = "완료 🎉";
  $("#timeLabel").textContent = fmt(state.total);
  $("#nextLabel").textContent = "수고하셨습니다!";
  $("#ringFg").style.strokeDashoffset = 0;
  $("#progressBar").style.width = "100%";
  $("#elapsedLabel").textContent = fmt(state.total);
  $("#pauseBtn").textContent = "↻";
  announce(null);
  releaseWake();
  releasePlaybackSession();
}

function skip(dir) {
  if (state.done) return;
  cancelScheduledAudio();
  let idx = state.idx;
  if (dir > 0) {
    if (idx + 1 >= state.phases.length) { finish(); return; }
    idx++;
  } else {
    // 시작 1.5초 이후면 현재 페이즈 처음으로, 아니면 이전 페이즈로
    const intoMs = state.phases[idx].dur * 1000 - (state.running ? state.phaseEndsAt - performance.now() : state.pausedRemain);
    if (intoMs < 1500 && idx > 0) idx--;
  }
  enterPhase(idx, state.phases[idx].dur * 1000);
  if (state.running) { scheduleAllAudio(); announce(state.phases[idx]); }
  else state.pausedRemain = state.phases[idx].dur * 1000;
  render();
}

// ---------------- 렌더링 ----------------
function render(remainMs) {
  if (state.done) return;
  const ph = state.phases[state.idx];
  if (!ph) return;
  if (remainMs == null) remainMs = state.running ? state.phaseEndsAt - performance.now() : state.pausedRemain;
  remainMs = Math.max(0, remainMs);
  const remainSec = Math.ceil(remainMs / 1000);

  $("#phaseLabel").textContent = ph.type === "work" ? workName(ph) : LABEL[ph.type];
  $("#timeLabel").textContent = ph.dur >= 60 ? fmt(remainSec) : String(remainSec);

  const next = state.phases[state.idx + 1];
  $("#nextLabel").textContent = next
    ? "다음 · " + (next.type === "work" ? workName(next) : LABEL[next.type]) + " " + next.dur + "초"
    : "마지막 구간!";

  const maxRound = Math.max(...state.phases.map(p => p.round));
  const maxSet = Math.max(...state.phases.map(p => p.set));
  $("#roundLabel").textContent = "라운드 " + ph.round + "/" + maxRound;
  $("#setLabel").textContent = "세트 " + ph.set + "/" + maxSet;
  $("#setLabel").style.display = maxSet > 1 ? "" : "none";
  // 서킷 모드일 때 운동 순번 표시
  const exL = $("#exLabel");
  if (ph.type === "work" && ph.exTotal > 1) { exL.style.display = ""; exL.textContent = "운동 " + ph.exNo + "/" + ph.exTotal; }
  else exL.style.display = "none";

  // 링: 현재 페이즈 진행률
  const frac = ph.dur > 0 ? remainMs / (ph.dur * 1000) : 0;
  $("#ringFg").style.strokeDashoffset = -CIRC * (1 - Math.min(1, Math.max(0, frac)));

  // 전체 진행률
  const elapsed = state.elapsedBefore + (ph.dur - remainMs / 1000);
  $("#progressBar").style.width = Math.min(100, (elapsed / state.total) * 100) + "%";
  $("#elapsedLabel").textContent = fmt(elapsed);
}

// ---------------- 이벤트 ----------------
$("#startBtn").addEventListener("click", startWorkout);
$("#pauseBtn").addEventListener("click", () => {
  if (state.done) { stopWorkout(); startWorkout(); return; } // 완료 후 ↻ = 다시 시작
  state.running ? pause() : resume();
});
$("#nextBtn").addEventListener("click", () => skip(1));
$("#prevBtn").addEventListener("click", () => skip(-1));
$("#stopBtn").addEventListener("click", stopWorkout);

$$(".step").forEach(btn => btn.addEventListener("click", () => {
  const input = $("#" + btn.dataset.for);
  const d = parseInt(btn.dataset.d, 10);
  let v = (parseInt(input.value, 10) || 0) + d;
  v = Math.max(parseInt(input.min, 10) || 0, Math.min(parseInt(input.max, 10) || 9999, v));
  input.value = v;
  updateTotal();
  saveSettings();
}));
$("#form").addEventListener("input", () => { updateTotal(); saveSettings(); });
// 클릭/포커스하면 기존 숫자가 통째로 선택돼 바로 새 값을 입력할 수 있게
$$(".stepper input").forEach(el => {
  el.addEventListener("focus", () => setTimeout(() => el.select(), 0));
  el.addEventListener("change", () => { // 입력이 끝나면 범위에 맞게 정리해서 표시
    let v = parseInt(el.value, 10);
    if (isNaN(v)) v = parseInt(el.min, 10) || 0;
    v = Math.max(parseInt(el.min, 10) || 0, Math.min(parseInt(el.max, 10) || 9999, v));
    el.value = v;
    updateTotal();
    saveSettings();
  });
});
$$(".opt input").forEach(el => el.addEventListener("change", saveSettings));

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" && e.code !== "Escape") return;
  const running = !$("#run").hidden;
  if (e.code === "Space") {
    e.preventDefault();
    if (!running) startWorkout();
    else if (state.done) { stopWorkout(); startWorkout(); }
    else state.running ? pause() : resume();
  } else if (running && e.code === "ArrowRight") skip(1);
  else if (running && e.code === "ArrowLeft") skip(-1);
  else if (running && e.code === "Escape") stopWorkout();
});

// 효과음 토글이 운동 중에 바뀌면 스케줄 갱신
$("#optSound").addEventListener("change", () => {
  if (state.running) scheduleAllAudio();
});

loadSettings();
renderExList();
updateTotal();
