const canvas = document.querySelector("#visualizer");
const ctx = canvas.getContext("2d", { alpha: false });
const songInput = document.querySelector("#songInput");
const playButton = document.querySelector("#playButton");
const stopButton = document.querySelector("#stopButton");
const exportButton = document.querySelector("#exportButton");
const downloadLink = document.querySelector("#downloadLink");
const seedInput = document.querySelector("#seedInput");
const randomSeed = document.querySelector("#randomSeed");
const sceneSelect = document.querySelector("#sceneSelect");
const paletteSelect = document.querySelector("#paletteSelect");
const trackName = document.querySelector("#trackName");
const timeReadout = document.querySelector("#timeReadout");
const levelMeter = document.querySelector("#levelMeter");

const controls = {
  energy: document.querySelector("#energy"),
  bloom: document.querySelector("#bloom"),
  center: document.querySelector("#center"),
  color: document.querySelector("#color"),
  saturation: document.querySelector("#saturation"),
  warp: document.querySelector("#warp"),
  bars: document.querySelector("#bars"),
  motion: document.querySelector("#motion"),
  grain: document.querySelector("#grain"),
  mirror: document.querySelector("#mirror"),
  trails: document.querySelector("#trails"),
  beatFlash: document.querySelector("#beatFlash"),
};

const palettes = {
  prism: ["#0cf2ff", "#ff2bd6", "#fff95b", "#6cff6c"],
  ember: ["#fff4bf", "#ff9f1c", "#f71735", "#461220"],
  glacier: ["#e8fcff", "#79d7ff", "#3b82f6", "#102a43"],
  acid: ["#f8ff00", "#00ff85", "#00c2ff", "#111111"],
  mono: ["#ffffff", "#c8d3dc", "#66717d", "#050505"],
};

let audioContext;
let analyser;
let source;
let audio;
let data;
let smooth = 0;
let beat = 0;
let rafId;
let seedState = makeSeed(seedInput.value);
let particles = [];
let lastTime = performance.now();
let recordDestination;
let mediaRecorder;
let recordedChunks = [];
let exportUrl;
let exporting = false;

function makeSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function random() {
  seedState += 0x6d2b79f5;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function reseed() {
  seedState = makeSeed(seedInput.value || "seesound");
  particles = Array.from({ length: 260 }, () => ({
    a: random() * Math.PI * 2,
    r: 0.08 + random() * 0.86,
    s: 0.16 + random() * 1.5,
    z: 0.25 + random() * 1.7,
    size: 0.8 + random() * 3.8,
  }));
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function loadSong(file) {
  if (exporting) stopExport();
  if (!audioContext) {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    data = new Uint8Array(analyser.frequencyBinCount);
  }

  if (audio) {
    audio.pause();
    URL.revokeObjectURL(audio.src);
  }
  if (source) {
    source.disconnect();
  }

  audio = new Audio();
  audio.src = URL.createObjectURL(file);
  audio.crossOrigin = "anonymous";
  audio.preload = "metadata";
  source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  recordDestination = audioContext.createMediaStreamDestination();
  source.connect(recordDestination);

  audio.addEventListener("timeupdate", updateTime);
  audio.addEventListener("loadedmetadata", updateTime);
  audio.addEventListener("ended", () => {
    playButton.textContent = "Play";
  });

  trackName.textContent = file.name;
  playButton.disabled = false;
  stopButton.disabled = false;
  exportButton.disabled = !canRecord();
  updateTime();
}

function values() {
  return {
    energy: Number(controls.energy.value) / 100,
    bloom: Number(controls.bloom.value) / 100,
    center: Number(controls.center.value) / 100,
    color: Number(controls.color.value) / 100,
    saturation: Number(controls.saturation.value) / 100,
    warp: Number(controls.warp.value) / 100,
    bars: Number(controls.bars.value),
    motion: Number(controls.motion.value) / 100,
    grain: Number(controls.grain.value) / 100,
    mirror: controls.mirror.checked,
    trails: controls.trails.checked,
    beatFlash: controls.beatFlash.checked,
    scene: sceneSelect.value,
    palette: palettes[paletteSelect.value],
  };
}

function audioMetrics() {
  if (!analyser || !data) {
    return { low: 0.08, mid: 0.04, high: 0.03, level: 0.05 };
  }
  analyser.getByteFrequencyData(data);
  const low = average(2, 32) / 255;
  const mid = average(32, 160) / 255;
  const high = average(160, 520) / 255;
  const level = Math.min(1, low * 0.55 + mid * 0.32 + high * 0.22);
  smooth = smooth * 0.84 + level * 0.16;
  beat = Math.max(0, beat * 0.9, low - smooth * 1.15);
  levelMeter.style.transform = `scaleX(${Math.min(1, level * 2.8)})`;
  return { low, mid, high, level };
}

function average(start, end) {
  let total = 0;
  const capped = Math.min(end, data.length);
  for (let i = start; i < capped; i += 1) total += data[i];
  return total / Math.max(1, capped - start);
}

function render(now) {
  rafId = requestAnimationFrame(render);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const v = values();
  const m = audioMetrics();
  const cx = width / 2;
  const cy = height / 2;
  const base = Math.min(width, height);

  if (v.trails) {
    ctx.fillStyle = `rgba(3, 5, 8, ${0.16 - v.motion * 0.08})`;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#030508";
    ctx.fillRect(0, 0, width, height);
  }

  const flash = v.beatFlash ? Math.min(0.22, beat * 0.75) : 0;
  if (flash > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, width, height);
  }

  drawBackdrop(ctx, width, height, now, v, m);
  if (v.scene === "tunnel") drawTunnel(ctx, cx, cy, base, now, v, m, dt);
  if (v.scene === "radar") drawRadar(ctx, cx, cy, base, now, v, m);
  if (v.scene === "crystal") drawCrystal(ctx, cx, cy, base, now, v, m);
  if (v.scene === "nebula") drawNebula(ctx, cx, cy, base, now, v, m, dt);
  drawSpectrum(ctx, cx, cy, base, width, height, now, v, m);
  if (v.grain > 0.02) drawGrain(ctx, width, height, v.grain);
}

function drawBackdrop(context, width, height, now, v, m) {
  const gradient = context.createRadialGradient(
    width * (0.46 + Math.sin(now * 0.00019) * 0.1),
    height * (0.48 + Math.cos(now * 0.00016) * 0.1),
    20,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, withAlpha(v.palette[1], (0.23 + m.low * 0.16) * v.center, v));
  gradient.addColorStop(0.48, withAlpha(v.palette[2], 0.08 + v.bloom * 0.08, v));
  gradient.addColorStop(1, "#030508");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawNebula(context, cx, cy, base, now, v, m, dt) {
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const p of particles) {
    p.a += dt * (0.08 + v.motion * 0.8) * p.s;
    const pulse = 1 + m.low * 0.9 + beat * 1.8;
    const wobble = Math.sin(now * 0.001 * p.s + p.r * 8) * v.warp * 42;
    const r = p.r * base * 0.62 * pulse + wobble;
    const x = cx + Math.cos(p.a) * r * p.z;
    const y = cy + Math.sin(p.a * 1.15) * r * 0.62;
    context.fillStyle = withAlpha(v.palette[Math.floor(p.z * 10) % v.palette.length], 0.18 + m.high * 0.5, v);
    context.beginPath();
    context.arc(x, y, p.size * (1 + m.mid * 3), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawTunnel(context, cx, cy, base, now, v, m) {
  context.save();
  context.translate(cx, cy);
  context.rotate(now * 0.00012 * (1 + v.motion * 4));
  context.globalCompositeOperation = "lighter";
  const rings = 34;
  for (let i = 1; i <= rings; i += 1) {
    const t = i / rings;
    const radius = t * base * (0.08 + t * 0.62) * (1 + m.low * 0.45);
    const sides = 5 + Math.floor((i + seedState) % 7);
    context.strokeStyle = withAlpha(v.palette[i % v.palette.length], 0.06 + t * 0.42, v);
    context.lineWidth = 1 + v.bloom * 5 + m.mid * 8;
    polygon(context, 0, 0, radius, sides, now * 0.00035 + i * v.warp);
    context.stroke();
  }
  context.restore();
}

function drawRadar(context, cx, cy, base, now, v, m) {
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";
  const sweep = now * 0.0012 * (0.4 + v.motion * 2.4);
  for (let i = 0; i < 9; i += 1) {
    context.strokeStyle = withAlpha(v.palette[i % v.palette.length], 0.08 + m.high * 0.22, v);
    context.lineWidth = 1 + i * 0.18;
    context.beginPath();
    context.arc(0, 0, (base * 0.07) + i * base * 0.065 * (1 + m.low), 0, Math.PI * 2);
    context.stroke();
  }
  for (let i = 0; i < 24; i += 1) {
    const a = sweep + i * Math.PI * 2 / 24;
    const len = base * (0.22 + randomStatic(i) * 0.34 + m.mid * 0.25);
    context.strokeStyle = withAlpha(v.palette[i % v.palette.length], i % 3 === 0 ? 0.55 : 0.18, v);
    context.lineWidth = 1 + m.low * 7;
    context.beginPath();
    context.moveTo(Math.cos(a) * base * 0.04, Math.sin(a) * base * 0.04);
    context.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    context.stroke();
  }
  context.restore();
}

function drawCrystal(context, cx, cy, base, now, v, m) {
  context.save();
  context.translate(cx, cy);
  context.rotate(now * 0.0002 * (0.4 + v.motion * 2));
  context.globalCompositeOperation = "lighter";
  const shards = 44;
  for (let i = 0; i < shards; i += 1) {
    const a = i / shards * Math.PI * 2;
    const inner = base * (0.07 + m.low * 0.12);
    const outer = base * (0.18 + randomStatic(i) * 0.33 + m.mid * 0.36 + v.energy * 0.18);
    context.fillStyle = withAlpha(v.palette[i % v.palette.length], 0.08 + m.high * 0.4 + v.bloom * 0.08, v);
    context.beginPath();
    context.moveTo(Math.cos(a - 0.035) * inner, Math.sin(a - 0.035) * inner);
    context.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    context.lineTo(Math.cos(a + 0.06 + v.warp * 0.1) * inner * 1.8, Math.sin(a + 0.06 + v.warp * 0.1) * inner * 1.8);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function drawSpectrum(context, cx, cy, base, width, height, now, v, m) {
  const count = Math.min(v.bars, data ? data.length : v.bars);
  const radius = base * (0.2 + v.energy * 0.18 + m.low * 0.22);
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";

  for (let i = 0; i < count; i += 1) {
    const bin = data ? data[Math.floor(i / count * data.length)] / 255 : 0.18 + Math.sin(now * 0.002 + i) * 0.08;
    const a = i / count * Math.PI * 2 + now * 0.00009 * (1 + v.motion * 3);
    const amp = bin * base * (0.16 + v.energy * 0.28);
    const wobble = Math.sin(i * 0.21 + now * 0.0013) * v.warp * 18;
    const x1 = Math.cos(a) * (radius + wobble);
    const y1 = Math.sin(a) * (radius + wobble);
    const x2 = Math.cos(a) * (radius + amp + wobble);
    const y2 = Math.sin(a) * (radius + amp + wobble);
    context.strokeStyle = withAlpha(v.palette[i % v.palette.length], 0.34 + bin * 0.62, v);
    context.lineWidth = 1 + v.bloom * 4 + bin * 5;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();

    if (v.mirror) {
      context.beginPath();
      context.moveTo(-x1, y1);
      context.lineTo(-x2, y2);
      context.stroke();
    }
  }

  context.fillStyle = withAlpha(v.palette[0], (0.12 + m.low * 0.36) * v.center, v);
  context.beginPath();
  context.arc(0, 0, radius * (0.44 + beat), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawGrain(context, width, height, amount) {
  const dots = Math.floor(width * height * amount * 0.00032);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < dots; i += 1) {
    const shade = Math.floor(120 + random() * 135);
    context.fillStyle = `rgba(${shade},${shade},${shade},${0.018 + amount * 0.035})`;
    context.fillRect(random() * width, random() * height, 1, 1);
  }
  context.restore();
}

function polygon(context, x, y, radius, sides, rotation) {
  context.beginPath();
  for (let i = 0; i <= sides; i += 1) {
    const a = rotation + i / sides * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
}

function randomStatic(n) {
  let x = Math.imul(makeSeed(seedInput.value || "seesound") ^ n, 2654435761);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

function withAlpha(hex, alpha, v) {
  const color = toneColor(hex, v);
  return `rgba(${color.r},${color.g},${color.b},${Math.max(0, Math.min(1, alpha * (v?.color ?? 1)))})`;
}

function toneColor(hex, v) {
  const value = hex.replace("#", "");
  const saturation = v?.saturation ?? 1;
  const mix = 1 - Math.max(0, Math.min(1.6, saturation));
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const gray = r * 0.299 + g * 0.587 + b * 0.114;
  return {
    r: clampByte(gray * mix + r * saturation),
    g: clampByte(gray * mix + g * saturation),
    b: clampByte(gray * mix + b * saturation),
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes.toString().padStart(2, "0")}:${rest}`;
}

function updateTime() {
  const current = audio ? audio.currentTime : 0;
  const duration = audio ? audio.duration : 0;
  timeReadout.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

songInput.addEventListener("change", () => {
  const [file] = songInput.files;
  if (file) loadSong(file);
});

exportButton.addEventListener("click", async () => {
  if (!audio || !canRecord()) return;
  if (exporting) {
    stopExport();
    return;
  }
  await startExport();
});

playButton.addEventListener("click", async () => {
  if (!audio) return;
  await audioContext.resume();
  if (audio.paused) {
    await audio.play();
    playButton.textContent = "Pause";
  } else {
    audio.pause();
    playButton.textContent = "Play";
  }
});

stopButton.addEventListener("click", () => {
  if (!audio) return;
  if (exporting) stopExport();
  audio.pause();
  audio.currentTime = 0;
  playButton.textContent = "Play";
  updateTime();
});

randomSeed.addEventListener("click", () => {
  seedInput.value = Math.random().toString(36).slice(2, 10);
  reseed();
});

function canRecord() {
  return Boolean(window.MediaRecorder && canvas.captureStream);
}

async function startExport() {
  await audioContext.resume();
  if (exportUrl) {
    URL.revokeObjectURL(exportUrl);
    exportUrl = undefined;
  }
  downloadLink.hidden = true;
  downloadLink.removeAttribute("href");
  recordedChunks = [];
  exporting = true;
  exportButton.textContent = "Stop Export";
  playButton.disabled = true;

  audio.pause();
  audio.currentTime = 0;
  updateTime();

  const videoStream = canvas.captureStream(30);
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...recordDestination.stream.getAudioTracks(),
  ]);
  const options = preferredRecorderOptions();
  mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => finishExport(stream));
  audio.addEventListener("ended", stopExport, { once: true });
  mediaRecorder.start(1000);
  try {
    await audio.play();
    playButton.textContent = "Pause";
  } catch (error) {
    stopExport();
    throw error;
  }
}

function stopExport() {
  if (!exporting || !mediaRecorder) return;
  exporting = false;
  exportButton.textContent = "Export WebM";
  if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

function finishExport(stream) {
  stream.getTracks().forEach((track) => track.stop());
  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "video/webm" });
  const safeName = (trackName.textContent || "seesound")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "seesound";
  exportUrl = URL.createObjectURL(blob);
  downloadLink.href = exportUrl;
  downloadLink.download = `${safeName}-seesound.webm`;
  downloadLink.hidden = false;
  playButton.disabled = false;
  mediaRecorder = undefined;
}

function preferredRecorderOptions() {
  const choices = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mimeType = choices.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : {};
}

seedInput.addEventListener("input", reseed);
window.addEventListener("resize", resize);

for (const input of document.querySelectorAll("input[type='range']")) {
  const output = input.parentElement.querySelector("output");
  input.addEventListener("input", () => {
    output.value = input.value;
    output.textContent = input.value;
  });
}

reseed();
resize();
rafId = requestAnimationFrame(render);
