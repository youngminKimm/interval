"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LABEL = { prepare: "준비", work: "운동", rest: "휴식", setrest: "세트 휴식", done: "완료" };
const CIRC = 2 * Math.PI * 45; // ring 둘레

// ---------------- 설정 ----------------
const FIELDS = ["prepare", "work", "rest", "rounds", "sets", "setrest"];

function readForm() {
  const cfg = {};
  for (const f of FIELDS) {
    const el = $("#" + f);
    let v = parseInt(el.value, 10);
    if (isNaN(v)) v = parseInt(el.min, 10) || 0;
    v = Math.max(parseInt(el.min, 10) || 0, Math.min(parseInt(el.max, 10) || 9999, v));
    el.value = v;
    cfg[f] = v;
  }
  return cfg;
}
function writeForm(cfg) {
  for (const f of FIELDS) if (cfg[f] != null) $("#" + f).value = cfg[f];
  updateTotal();
}
function saveSettings() {
  const opts = { sound: $("#optSound").checked, voice: $("#optVoice").checked, wake: $("#optWake").checked };
  localStorage.setItem("interval.cfg", JSON.stringify({ ...readForm(), ...opts }));
}
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("interval.cfg"));
    if (!saved) return;
    writeForm(saved);
    if (saved.sound != null) $("#optSound").checked = saved.sound;
    if (saved.voice != null) $("#optVoice").checked = saved.voice;
    if (saved.wake != null) $("#optWake").checked = saved.wake;
  } catch (e) { /* 무시 */ }
}

// ---------------- 페이즈 시퀀스 ----------------
function buildPhases(cfg) {
  const p = [];
  if (cfg.prepare > 0) p.push({ type: "prepare", dur: cfg.prepare, round: 1, set: 1 });
  for (let s = 1; s <= cfg.sets; s++) {
    for (let r = 1; r <= cfg.rounds; r++) {
      p.push({ type: "work", dur: cfg.work, round: r, set: s });
      if (r < cfg.rounds && cfg.rest > 0) p.push({ type: "rest", dur: cfg.rest, round: r, set: s });
    }
    if (s < cfg.sets && cfg.setrest > 0) p.push({ type: "setrest", dur: cfg.setrest, round: cfg.rounds, set: s });
  }
  return p;
}
const totalSec = (phases) => phases.reduce((a, p) => a + p.dur, 0);

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
function speak(text) {
  if (!$("#optVoice").checked || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 1.1;
  speechSynthesis.speak(u);
}
function announce(ph) {
  if (!ph) { speak("운동 완료! 수고하셨습니다"); return; }
  if (ph.type === "work") speak(ph.round + "라운드, 운동 시작");
  else speak(LABEL[ph.type]);
}

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

  audioCtx(); // 사용자 제스처 안에서 활성화
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
  clearInterval(state.timer);
  releaseWake();
}
function stopWorkout() {
  cancelScheduledAudio();
  clearInterval(state.timer);
  speechSynthesis?.cancel?.();
  state.running = false;
  state.done = false;
  document.body.classList.remove("paused");
  document.body.dataset.phase = "idle";
  releaseWake();
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

  $("#phaseLabel").textContent = LABEL[ph.type];
  $("#timeLabel").textContent = ph.dur >= 60 ? fmt(remainSec) : String(remainSec);

  const next = state.phases[state.idx + 1];
  $("#nextLabel").textContent = next ? "다음 · " + LABEL[next.type] + " " + next.dur + "초" : "마지막 구간!";

  const cfg = { rounds: Math.max(...state.phases.map(p => p.round)), sets: Math.max(...state.phases.map(p => p.set)) };
  $("#roundLabel").textContent = "라운드 " + ph.round + "/" + cfg.rounds;
  $("#setLabel").textContent = "세트 " + ph.set + "/" + cfg.sets;
  $("#setLabel").style.display = cfg.sets > 1 ? "" : "none";

  // 링: 현재 페이즈 진행률
  const frac = ph.dur > 0 ? remainMs / (ph.dur * 1000) : 0;
  $("#ringFg").style.strokeDashoffset = CIRC * (1 - Math.min(1, Math.max(0, frac)));

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
$$(".opt input").forEach(el => el.addEventListener("change", saveSettings));

$$("#presets .chip").forEach(chip => chip.addEventListener("click", () => {
  writeForm(JSON.parse(chip.dataset.preset));
  saveSettings();
}));

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
updateTotal();
