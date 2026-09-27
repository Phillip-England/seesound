const canvas = document.querySelector("#visualizer");
const stage = document.querySelector(".stage");
const gl = canvas.getContext("webgl", {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
});

if (!gl) {
  throw new Error("SeeSound needs WebGL support in this browser.");
}

const songInput = document.querySelector("#songInput");
const songDrop = document.querySelector("#songDrop");
const playButton = document.querySelector("#playButton");
const stopButton = document.querySelector("#stopButton");
const exportButton = document.querySelector("#exportButton");
const downloadLink = document.querySelector("#downloadLink");
const seedInput = document.querySelector("#seedInput");
const randomSeed = document.querySelector("#randomSeed");
const remixButton = document.querySelector("#remixButton");
const randomLookButton = document.querySelector("#randomLookButton");
const lookDeck = document.querySelector("#lookDeck");
const sceneSelect = document.querySelector("#sceneSelect");
const paletteSelect = document.querySelector("#paletteSelect");
const trackName = document.querySelector("#trackName");
const timeReadout = document.querySelector("#timeReadout");
const levelMeter = document.querySelector("#levelMeter");
const overlayInput = document.querySelector("#overlayInput");
const overlayPreview = document.querySelector("#overlayPreview");
const overlayPosition = document.querySelector("#overlayPosition");
const overlaySize = document.querySelector("#overlaySize");
const overlayOpacity = document.querySelector("#overlayOpacity");
const overlayLife = document.querySelector("#overlayLife");
const clearOverlay = document.querySelector("#clearOverlay");
const exportCanvas = document.createElement("canvas");
const exportContext = exportCanvas.getContext("2d", { alpha: true });

const controls = {
  energy: document.querySelector("#energy"),
  bloom: document.querySelector("#bloom"),
  center: document.querySelector("#center"),
  color: document.querySelector("#color"),
  saturation: document.querySelector("#saturation"),
  warp: document.querySelector("#warp"),
  bars: document.querySelector("#bars"),
  motion: document.querySelector("#motion"),
  predict: document.querySelector("#predict"),
  grain: document.querySelector("#grain"),
  mirror: document.querySelector("#mirror"),
  trails: document.querySelector("#trails"),
  beatFlash: document.querySelector("#beatFlash"),
  exportHud: document.querySelector("#exportHud"),
};

const palettes = {
  prism: ["#0cf2ff", "#ff2bd6", "#fff95b", "#6cff6c"],
  ember: ["#fff4bf", "#ff9f1c", "#f71735", "#461220"],
  glacier: ["#e8fcff", "#79d7ff", "#3b82f6", "#102a43"],
  acid: ["#f8ff00", "#00ff85", "#00c2ff", "#111111"],
  velvet: ["#fff7ed", "#fb7185", "#7c3aed", "#020617"],
  chrome: ["#f8fafc", "#22d3ee", "#a3e635", "#111827"],
  mono: ["#ffffff", "#c8d3dc", "#66717d", "#050505"],
  solar: ["#fff7b2", "#ff7a18", "#dc2626", "#120907"],
  lagoon: ["#e0fdfa", "#2dd4bf", "#0ea5e9", "#082f49"],
  candy: ["#fff1f2", "#fb7185", "#a78bfa", "#22d3ee"],
  noir: ["#f8fafc", "#94a3b8", "#ef4444", "#020617"],
  volt: ["#faff00", "#36ff8b", "#14f1ff", "#16011f"],
  magma: ["#fff7ad", "#ff4d00", "#b300ff", "#050008"],
  aurora: ["#e6fffb", "#34d399", "#38bdf8", "#312e81"],
  plasma: ["#ffe8fa", "#ff3df2", "#7c3aed", "#00e5ff"],
};

const sceneIds = {
  nebula: 0,
  tunnel: 1,
  radar: 2,
  crystal: 3,
  waveform: 4,
  orbit: 5,
  horizon: 6,
  rain: 7,
  signal: 8,
  barscape: 9,
  sequence: 10,
  polygon: 11,
  triangles: 12,
  terrain: 13,
  glyphs: 14,
  mesh: 15,
  cymatics: 16,
  lissajous: 17,
  mandala: 18,
  hypercube: 19,
  julia: 20,
  voronoi: 21,
  spiral: 22,
};

const lookPresets = [
  ["nebula", "prism"],
  ["tunnel", "chrome"],
  ["radar", "lagoon"],
  ["crystal", "glacier"],
  ["waveform", "acid"],
  ["orbit", "velvet"],
  ["horizon", "ember"],
  ["rain", "candy"],
  ["signal", "solar"],
  ["barscape", "mono"],
  ["sequence", "chrome"],
  ["polygon", "noir"],
  ["triangles", "acid"],
  ["terrain", "solar"],
  ["glyphs", "velvet"],
  ["mesh", "lagoon"],
  ["cymatics", "volt"],
  ["lissajous", "plasma"],
  ["mandala", "magma"],
  ["hypercube", "aurora"],
  ["julia", "plasma"],
  ["voronoi", "lagoon"],
  ["spiral", "magma"],
];

let audioContext;
let analyser;
let source;
let audio;
let data;
let smooth = 0;
let beat = 0;
let rafId;
let seedState = makeSeed(seedInput.value);
let stableSeed = seedState;
let lastTime = performance.now();
let recordDestination;
let mediaElementRecordStream;
let mediaRecorder;
let recordedChunks = [];
let exportUrl;
let exporting = false;
let recordGain;
let captureTrack;
let lastExportCaptureTime = -Infinity;
let exportPausedForVisibility = false;
let exportPausedForBuffering = false;
let frame = 0;
let feedbackIndex = 0;
let overlayImage;
let overlayUrl;

const EXPORT_FADE_IN_SECONDS = 0.08;
const EXPORT_FPS = 30;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const AUDIO_BINS = 1024;
const PREDICT_BINS = 2048;
const audioTextureData = new Uint8Array(AUDIO_BINS);
const predictTextureData = new Uint8Array(PREDICT_BINS);
const smoothSpectrum = new Float32Array(AUDIO_BINS);
const audioLevels = { low: 0, mid: 0, high: 0, level: 0 };
const visualValues = {
  energy: 0.68,
  bloom: 0.58,
  center: 0.46,
  color: 1,
  saturation: 1,
  warp: 0.42,
  bars: 96,
  motion: 0.54,
  predict: 0.34,
  grain: 0.2,
};
let trackAnalysis = { duration: 0, ready: false };
let analysisToken = 0;

const vertexSource = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentSource = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;
uniform float uFrame;
uniform float uEnergy;
uniform float uBloom;
uniform float uCenter;
uniform float uColor;
uniform float uSaturation;
uniform float uWarp;
uniform float uBars;
uniform float uMotion;
uniform float uPredict;
uniform float uGrain;
uniform float uMirror;
uniform float uTrails;
uniform float uBeatFlash;
uniform float uTrackProgress;
uniform float uTrackDuration;
uniform int uScene;
uniform vec4 uAudio;
uniform vec4 uPalette[4];
uniform sampler2D uSpectrum;
uniform sampler2D uFuture;
uniform sampler2D uPrevious;

#define PI 3.141592653589793
#define TAU 6.283185307179586

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + uSeed * 0.0001);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += noise(p) * amp;
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.52;
  }
  return v;
}

float spectrum(float x) {
  return texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

float futureEnergy(float secondsAhead) {
  float span = max(1.0, uTrackDuration);
  float x = clamp(uTrackProgress + secondsAhead / span, 0.0, 1.0);
  return texture2D(uFuture, vec2(x, 0.5)).r * uPredict;
}

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdRegular(vec2 p, float n, float radius) {
  float a = atan(p.y, p.x) + PI;
  float sector = TAU / n;
  return cos(floor(0.5 + a / sector) * sector - a) * length(p) - radius;
}

vec3 paletteRamp(float t) {
  t = fract(t);
  vec3 a = mix(uPalette[0].rgb, uPalette[1].rgb, smoothstep(0.0, 0.34, t));
  vec3 b = mix(uPalette[2].rgb, uPalette[3].rgb, smoothstep(0.56, 1.0, t));
  vec3 c = mix(a, b, smoothstep(0.28, 0.82, t));
  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(gray), c, clamp(uSaturation, 0.0, 1.6));
}

float formulaField(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  vec2 q = p;
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + 1.0;
    q = abs(q * rot(0.37 + 0.09 * fi + t * 0.035 * uMotion)) - (0.22 + 0.035 * sin(fi + uSeed));
    q += 0.085 * vec2(sin(q.y * (fi + 1.6) + t + low * 3.0), cos(q.x * (fi + 2.1) - t * 0.7));
    f += abs(sin(q.x * (3.0 + fi) + cos(q.y * (2.6 + fi)) + t * (0.4 + high))) / fi;
  }
  return f + mid * 0.45;
}

vec3 nebula(vec2 p, float t) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  vec2 q = p;
  q *= rot(0.18 * sin(uSeed * 0.0007) + t * 0.018);
  q.x += sin(q.y * 1.8 + t * 0.28) * (0.12 + uWarp * 0.18);
  q.y += sin(q.x * 1.35 - t * 0.18) * (0.08 + uWarp * 0.14);

  float flow = fbm(q * (1.25 + uWarp * 0.55) + vec2(t * 0.035, -t * 0.025));
  float veil = 0.0;
  float filaments = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float offset = (fi - 2.0) * (0.16 + uCenter * 0.05);
    float bin = spectrum(fract(0.08 + fi * 0.13 + flow * 0.22));
    float wave = sin(q.x * (1.65 + fi * 0.42) + t * (0.22 + fi * 0.035) + flow * 4.0);
    float band = abs(q.y - offset - wave * (0.14 + uWarp * 0.16 + bin * 0.16));
    float soft = smoothstep(0.34 + low * 0.16, 0.0, band);
    float edge = smoothstep(0.055 + mid * 0.035, 0.0, band);
    veil += soft * (0.32 + bin * 0.52) / (1.0 + fi * 0.12);
    filaments += edge * (0.18 + high * 0.55 + bin * 0.35);
  }

  float core = pow(max(0.0, 1.0 - length(q * vec2(0.72, 1.08))), 2.2) * (0.34 + low * 0.95);
  float halo = exp(-abs(r - (0.42 + low * 0.12)) * (3.2 + uBloom * 3.8)) * (0.08 + mid * 0.32);
  float dustNoise = hash(floor((q + vec2(2.0)) * (44.0 + uBars * 0.08)));
  float dust = smoothstep(0.992 - high * 0.012, 1.0, dustNoise) * (0.08 + high * 0.62);
  float vignette = pow(max(0.0, 1.28 - r), 1.7);
  vec3 base = paletteRamp(flow * 0.42 + q.x * 0.08 + t * 0.018);
  vec3 accent = paletteRamp(0.18 + a / TAU + flow * 0.3);
  return (base * (veil + core + halo) + accent * (filaments + dust)) * vignette;
}

vec3 tunnel(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float r = length(p);
  float twist = t * (0.08 + uMotion * 0.28) + sin(r * 2.0 - t * 0.18) * uWarp * 0.28;
  vec2 q = p * rot(twist);
  float qr = max(0.035, length(q));
  float qa = atan(q.y, q.x);
  float depth = 1.0 / qr;
  float speed = 0.18 + uMotion * 0.52;
  float travel = depth * (0.24 + uWarp * 0.12) - t * speed;
  float z = fract(travel);
  float fade = smoothstep(0.04, 0.74, z) * (1.0 - smoothstep(0.8, 1.0, z));

  float lanes = 8.0 + floor(mod(uSeed, 5.0)) * 2.0;
  float lanePos = abs(fract((qa / TAU + 0.5) * lanes + z * 0.38) - 0.5);
  float laneBin = spectrum(fract(qa / TAU + 0.5));
  float lane = smoothstep(0.055 + laneBin * 0.02, 0.0, lanePos);

  float ringWave = abs(fract(travel * 3.2) - 0.5);
  float rings = smoothstep(0.035 + mid * 0.018, 0.0, ringWave);
  float wall = smoothstep(0.22, 0.54, qr) * (1.0 - smoothstep(1.2, 1.85, qr));
  float vanishing = exp(-qr * (1.8 + uCenter * 1.1)) * smoothstep(0.42, 0.9, qr) * (0.1 + low * 0.42);
  float tracer = smoothstep(0.988 - high * 0.018, 1.0, sin((qa * lanes * 1.35) - t * (1.5 + uMotion * 2.2) + laneBin * 5.0));
  float frame = smoothstep(0.028, 0.0, abs(sdRegular(q * rot(-t * 0.035), lanes * 0.5, 0.5 + z * 0.82 + low * 0.04)));

  vec3 wallColor = paletteRamp(z * 0.52 + qa / TAU + laneBin * 0.22);
  vec3 glowColor = paletteRamp(0.12 + z * 0.3 + t * 0.018);
  float structure = (lane * (0.34 + laneBin * 0.9) + rings * (0.28 + uBloom * 0.55) + frame * 0.22) * fade * wall;
  float highlights = tracer * lane * (0.16 + high * 0.85) * fade * wall;
  float aperture = smoothstep(0.08, 0.32, qr);
  float atmosphericLines = vanishing * (lane * 0.22 + rings * 0.16 + frame * 0.1) * fade * wall;
  return (wallColor * (structure + highlights) + glowColor * atmosphericLines) * aperture;
}

vec3 radar(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 q = p;
  float flow = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i) + 1.0;
    q *= rot(0.16 + sin(uSeed * 0.001 + fi) * 0.18);
    q += vec2(
      sin(q.y * (1.9 + fi * 0.34) + t * (0.24 + fi * 0.05)),
      cos(q.x * (2.1 + fi * 0.31) - t * (0.21 + fi * 0.04))
    ) * (0.13 + uWarp * 0.12);
    float bandX = fract(q.x * (1.2 + uBars * 0.012) + sin(q.y * 2.5 + t * 0.4) * 0.22);
    float ribbon = smoothstep(0.15, 0.0, abs(bandX - 0.5) - 0.08 * spectrum(fract(fi * 0.13 + r)));
    flow += ribbon / fi;
    glow += exp(-abs(sin(q.y * (2.2 + fi) + t * 0.32 + mid * 2.8)) * (3.4 + fi));
  }
  float wave = sin(a * (3.0 + mod(uSeed, 5.0)) + r * (8.0 + uWarp * 12.0) - t * (0.7 + uMotion * 1.2));
  float bloom = smoothstep(0.08, 0.95, flow) * (0.68 + low * 1.35);
  float lace = smoothstep(0.74, 1.0, wave) * (0.16 + high * 0.65);
  float vignette = pow(max(0.0, 1.25 - r), 1.7);
  return paletteRamp(flow * 0.18 + a / TAU + t * 0.025) * (bloom + glow * 0.1 + lace) * vignette;
}

vec3 crystal(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float r = length(p);
  float a = atan(p.y, p.x);
  float segments = 6.0 + floor(mod(uSeed, 6.0));
  float sector = TAU / segments;
  a = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 q = vec2(cos(a), sin(a)) * r;
  q *= rot(t * (0.05 + uMotion * 0.18) + sin(uSeed) * 0.4);
  q += vec2(
    fbm(q * 2.5 + t * 0.08),
    fbm(q.yx * 2.4 - t * 0.06)
  ) * uWarp * 0.25;
  float petals = 0.0;
  float glass = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i) + 1.0;
    float bin = spectrum(fract(fi * 0.17 + r * 0.37));
    vec2 w = q * rot(fi * 0.42 + t * 0.035);
    float d = abs(sdRegular(w, 3.0 + mod(fi + uSeed, 5.0), 0.18 + bin * 0.32 + low * 0.14));
    petals += smoothstep(0.09 + mid * 0.04, 0.0, d) / fi;
    glass += smoothstep(0.032, 0.0, abs(sdBox(w, vec2(0.08 + bin * 0.34, 0.008 + high * 0.035)))) * (0.8 / fi);
  }
  float core = pow(max(0.0, 1.0 - r * (1.08 + uCenter * 0.52)), 2.8) * (0.44 + low * 1.6);
  float halo = exp(-abs(r - (0.34 + low * 0.15)) * (5.0 + uBloom * 7.0)) * (0.12 + mid * 0.48);
  float sparkle = smoothstep(0.993 - high * 0.018, 1.0, hash(floor(q * (38.0 + uBars * 0.12))));
  return paletteRamp(r + petals * 0.22 + t * 0.026) * ((petals + glass) * (0.85 + uBloom) + core + halo + sparkle * high);
}

vec3 waveformField(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float y = p.y;
  float x = p.x * (0.72 + uWarp * 0.34);
  float field = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float lane = (fi - 4.0) * 0.16;
    float bin = spectrum(fract(abs(x) * 0.22 + fi * 0.071 + t * 0.018));
    float wave = sin(x * (3.0 + fi * 0.52 + uBars * 0.018) + t * (0.8 + fi * 0.08) + bin * 4.5);
    float target = lane + wave * (0.04 + bin * 0.2 + low * 0.08);
    float line = smoothstep(0.035 + mid * 0.025, 0.0, abs(y - target));
    float pulse = smoothstep(0.85, 1.0, sin((x + fi * 0.37) * (8.0 + uBars * 0.05) - t * (1.2 + uMotion)));
    field += line * (0.55 + bin * 1.8 + pulse * high);
    glow += exp(-abs(y - target) * (7.0 + uBloom * 14.0)) * (0.025 + bin * 0.055);
  }
  float grid = smoothstep(0.985, 1.0, sin((p.x + t * 0.035) * (12.0 + uBars * 0.035))) * 0.16;
  grid += smoothstep(0.99, 1.0, sin((p.y - t * 0.02) * 18.0)) * 0.12;
  float vignette = pow(max(0.0, 1.15 - length(p * vec2(0.82, 1.1))), 1.5);
  return paletteRamp(p.x * 0.18 + field * 0.08 + t * 0.026) * (field + glow * (1.0 + uBloom * 2.0) + grid) * vignette;
}

vec3 orbitGrid(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 color = vec3(0.0);
  float rings = 5.0 + floor(mod(uSeed, 5.0));
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float active = step(fi, rings + 1.0);
    float radius = 0.18 + fi * 0.115 + low * 0.035 * sin(fi + t);
    float bin = spectrum(fract(fi * 0.109 + a / TAU + 0.5));
    float ring = smoothstep(0.022 + mid * 0.018, 0.0, abs(r - radius - bin * 0.045));
    float spoke = smoothstep(0.97, 1.0, sin(a * (6.0 + fi + uBars * 0.035) + t * (0.35 + uMotion) + bin * 3.0));
    color += paletteRamp(fi * 0.13 + a / TAU + t * 0.02) * active * ring * (0.72 + bin * 2.0 + spoke * high * 1.5);
  }
  vec2 q = p * rot(t * (0.07 + uMotion * 0.22));
  float lattice = min(abs(fract(q.x * (4.0 + uBars * 0.018)) - 0.5), abs(fract(q.y * (4.0 + uBars * 0.018)) - 0.5));
  float grid = smoothstep(0.025, 0.0, lattice) * exp(-r * (1.2 + uCenter));
  float core = pow(max(0.0, 1.0 - r * (3.0 - uCenter)), 3.0) * (0.42 + low * 1.4);
  return color + paletteRamp(r + t * 0.025) * (grid * (0.12 + uBloom * 0.22) + core);
}

vec3 eventHorizon(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float nearFuture = futureEnergy(0.75);
  float farFuture = futureEnergy(2.4);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 q = p * rot(t * (0.04 + uMotion * 0.2) + farFuture * 0.8);
  float pull = 1.0 / max(0.08, r);
  float disk = abs(q.y * (1.0 + pull * 0.16) + sin(q.x * (3.2 + uWarp * 3.4) + t * 0.45) * (0.08 + nearFuture * 0.18));
  float accretion = smoothstep(0.18 + mid * 0.08, 0.0, disk) * smoothstep(1.25, 0.18, r);
  float lens = exp(-abs(r - (0.32 + low * 0.08 + farFuture * 0.1)) * (7.0 + uBloom * 8.0));
  float sparks = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + 1.0;
    float bin = spectrum(fract(a / TAU + 0.5 + fi * 0.071));
    float arm = smoothstep(0.035 + bin * 0.02, 0.0, abs(sin(a * (2.0 + fi * 0.45) + pull * 0.2 - t * (0.24 + uMotion * 0.8) + nearFuture * 2.0)));
    sparks += arm * bin / fi;
  }
  float core = pow(max(0.0, 1.0 - r * (2.8 + uCenter)), 4.0) * (0.5 + low * 1.2);
  float corona = exp(-r * (1.3 + uCenter)) * (0.08 + farFuture * 0.5);
  vec3 diskColor = paletteRamp(a / TAU + t * 0.018 + farFuture * 0.24);
  vec3 hotColor = paletteRamp(0.08 + r + nearFuture * 0.4);
  return diskColor * (accretion * (0.8 + high + nearFuture) + sparks * (0.5 + uBloom)) + hotColor * (lens + core + corona);
}

vec3 prismRain(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float incoming = futureEnergy(1.1);
  float horizon = futureEnergy(3.2);
  vec2 q = p;
  q.x += sin(p.y * 2.1 + t * 0.18) * (0.08 + uWarp * 0.18);
  q.y += t * (0.1 + uMotion * 0.44) + horizon * 0.6;
  vec3 color = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float laneCount = 8.0 + floor(mod(uSeed + fi, 7.0)) + uBars * 0.035;
    float lane = fract((q.x + 1.2) * laneCount + fi * 0.37);
    float row = fract(q.y * (2.2 + fi * 0.18) + fi * 0.13);
    float bin = spectrum(fract(lane * 0.82 + fi * 0.087));
    float drop = smoothstep(0.035 + bin * 0.018, 0.0, abs(lane - 0.5));
    float head = smoothstep(0.0, 0.18 + incoming * 0.18, row) * (1.0 - smoothstep(0.32 + bin * 0.2, 0.86, row));
    float shard = smoothstep(0.022 + mid * 0.018, 0.0, abs(sdBox(vec2(lane - 0.5, row - 0.2), vec2(0.018 + bin * 0.04, 0.12 + low * 0.08 + incoming * 0.12))));
    color += paletteRamp(fi * 0.1 + q.y * 0.04 + bin * 0.32 + t * 0.018) * (drop * head * (0.34 + bin * 1.8) + shard * (0.22 + high + incoming));
  }
  float mist = fbm(p * (2.0 + uWarp) + vec2(t * 0.04, -t * 0.03)) * (0.08 + horizon * 0.35);
  float vignette = pow(max(0.0, 1.18 - length(p * vec2(0.88, 1.08))), 1.6);
  return (color + paletteRamp(p.y * 0.2 + t * 0.02) * mist) * vignette;
}

vec3 signalBloom(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float soon = futureEnergy(0.55);
  float later = futureEnergy(1.8);
  vec2 q = p;
  float r = length(q);
  float field = formulaField(q * (0.82 + later * 0.18), t);
  float cells = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i) + 1.0;
    vec2 w = q * rot(fi * 0.58 + t * (0.03 + uMotion * 0.12));
    w += vec2(sin(w.y * 2.3 + t * 0.3), cos(w.x * 2.0 - t * 0.24)) * (0.08 + uWarp * 0.16 + soon * 0.08);
    float bin = spectrum(fract(fi * 0.137 + field * 0.08 + r * 0.26));
    float ring = smoothstep(0.028 + mid * 0.018, 0.0, abs(length(w) - (0.16 + fi * 0.11 + bin * 0.08 + later * 0.08)));
    float node = smoothstep(0.08 + bin * 0.05, 0.0, abs(sdRegular(w, 5.0 + mod(fi + uSeed, 4.0), 0.12 + soon * 0.08)));
    cells += ring * (0.48 + bin * 1.4) + node * (0.12 + high * 0.7 + soon);
    glow += exp(-abs(length(w) - (0.2 + fi * 0.1)) * (5.0 + uBloom * 8.0)) * (0.018 + bin * 0.06 + later * 0.025);
  }
  float bloom = pow(max(0.0, 1.0 - r * (0.92 + uCenter * 0.44)), 2.6) * (0.2 + low * 0.9 + later * 0.55);
  float scan = smoothstep(0.96, 1.0, sin((p.x + p.y) * (9.0 + uBars * 0.04) - t * (0.6 + uMotion) + soon * 4.0)) * (0.08 + high * 0.35);
  return paletteRamp(field * 0.08 + r * 0.45 + t * 0.018 + later * 0.18) * (cells + glow * (1.0 + uBloom * 2.0) + bloom + scan);
}

vec3 barScape(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float ahead = futureEnergy(1.25);
  vec2 q = p;
  q.x += sin(q.y * 2.3 + t * 0.24) * uWarp * 0.16;
  q.y += sin(q.x * 1.4 - t * 0.19) * uWarp * 0.08;

  float count = clamp(uBars * 0.52, 18.0, 96.0);
  float id = floor((q.x + 1.22) / 2.44 * count);
  float xCell = fract((q.x + 1.22) / 2.44 * count);
  float x = (id + 0.5) / count;
  float bin = spectrum(x);
  float nextBin = spectrum(fract(x + 0.013 + ahead * 0.03));
  float height = 0.12 + pow(bin, 0.68) * (0.85 + uEnergy * 0.85) + low * 0.28 + ahead * 0.18;
  float base = -0.72 + sin(id * 0.73 + t * 0.22) * uWarp * 0.05;
  float top = base + height;
  float body = smoothstep(0.45, 0.18, abs(xCell - 0.5)) * smoothstep(base - 0.02, base + 0.03, q.y) * smoothstep(top + 0.05, top - 0.02, q.y);
  float cap = smoothstep(0.032 + mid * 0.018, 0.0, abs(q.y - top)) * smoothstep(0.42, 0.18, abs(xCell - 0.5));
  float tick = smoothstep(0.028, 0.0, abs(fract((q.y - base) * (7.0 + uBars * 0.018)) - 0.5)) * body * (0.08 + high * 0.28);
  float trace = smoothstep(0.94, 1.0, sin(id * 1.71 - t * (1.5 + uMotion * 2.4) + nextBin * 6.0)) * cap * (0.4 + high * 1.2);

  float floorLine = smoothstep(0.018, 0.0, abs(q.y - base)) * (0.28 + low);
  float gridX = smoothstep(0.025, 0.0, abs(xCell - 0.5)) * smoothstep(-0.86, 0.8, q.y) * 0.08;
  float gridY = smoothstep(0.985, 1.0, sin((q.y + 0.8) * (12.0 + uBars * 0.03))) * 0.08;
  float vignette = pow(max(0.0, 1.2 - length(p * vec2(0.82, 1.08))), 1.45);
  vec3 barColor = paletteRamp(x + bin * 0.35 + t * 0.018);
  vec3 gridColor = paletteRamp(0.58 + q.y * 0.16 + t * 0.012);
  return (barColor * (body * (0.3 + bin * 1.8) + cap * (0.7 + uBloom + high) + trace + tick) + gridColor * (floorLine + gridX + gridY)) * vignette;
}

vec3 sequenceGrid(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(2.0);
  vec2 q = p * rot(0.08 * sin(t * 0.12 + uSeed));
  q += vec2(sin(q.y * 2.0 + t * 0.25), cos(q.x * 1.8 - t * 0.2)) * uWarp * 0.12;
  float scale = 4.0 + floor(uBars / 28.0);
  vec2 g = q * scale;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float idx = cell.x + cell.y * 13.0;
  float seq = fract(sin(idx * 12.9898 + uSeed * 0.001) * 43758.5453);
  float series = fract((cell.x * cell.x + cell.y * 1.618 + floor(t * (0.35 + uMotion)) + uSeed * 0.0003) * 0.077);
  float bin = spectrum(fract(seq * 0.58 + series * 0.42));
  float n = 3.0 + floor(mod(abs(cell.x) + abs(cell.y) + uSeed, 6.0));
  vec2 w = f * rot(seq * TAU + t * (0.06 + uMotion * 0.18));
  float radius = 0.18 + bin * 0.24 + low * 0.08 + future * 0.08;
  float poly = smoothstep(0.035 + mid * 0.02, 0.0, abs(sdRegular(w, n, radius)));
  float dotNode = smoothstep(0.075 + bin * 0.04, 0.0, length(f)) * (0.18 + high * 0.65);
  float connector = smoothstep(0.022, 0.0, abs(f.x + f.y * sin(seq * TAU))) * smoothstep(0.48, 0.08, length(f)) * (0.08 + bin * 0.32);
  float major = min(abs(fract(g.x) - 0.5), abs(fract(g.y) - 0.5));
  float grid = smoothstep(0.018, 0.0, major) * (0.08 + future * 0.18);
  float wave = smoothstep(0.96, 1.0, sin((cell.x + cell.y) * 0.8 - t * (0.85 + uMotion) + bin * 5.0)) * (0.1 + high * 0.4);
  float vignette = pow(max(0.0, 1.18 - length(p * vec2(0.86, 1.04))), 1.55);
  return paletteRamp(seq + series * 0.34 + t * 0.017) * (poly * (0.42 + bin * 1.4) + dotNode + connector + wave + grid) * vignette;
}

vec3 polygonConstellation(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float ahead = futureEnergy(0.8);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 color = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 1.0;
    float sides = 3.0 + mod(fi + floor(uSeed * 0.01), 7.0);
    float bin = spectrum(fract(fi * 0.113 + a / TAU + 0.5));
    vec2 q = p * rot(fi * 0.31 + t * (0.035 + uMotion * 0.12) * (1.0 + mod(fi, 3.0)));
    q += vec2(sin(q.y * (1.5 + fi * 0.2) + t * 0.2), cos(q.x * (1.4 + fi * 0.18) - t * 0.18)) * uWarp * 0.1;
    float radius = 0.16 + fi * 0.085 + bin * 0.12 + low * 0.06 + ahead * 0.05;
    float edge = smoothstep(0.024 + mid * 0.017, 0.0, abs(sdRegular(q, sides, radius)));
    float vertexPhase = abs(fract((atan(q.y, q.x) / TAU + 0.5) * sides) - 0.5);
    float vertices = smoothstep(0.055, 0.0, vertexPhase) * edge * (0.25 + high * 1.2);
    float chord = smoothstep(0.012 + bin * 0.006, 0.0, abs(sdBox(q * rot(fi * 0.7), vec2(radius * 0.72, 0.004 + high * 0.014)))) * (0.13 + bin * 0.55);
    color += paletteRamp(fi * 0.11 + bin * 0.24 + t * 0.016) * (edge * (0.46 + bin * 1.35) + vertices + chord);
  }
  float starHash = hash(floor((p + 1.4) * (24.0 + uBars * 0.08)));
  float stars = smoothstep(0.988 - high * 0.016, 1.0, starHash) * (0.1 + high * 0.75);
  float halo = exp(-r * (1.4 + uCenter)) * (0.08 + ahead * 0.38 + low * 0.22);
  return (color + paletteRamp(a / TAU + t * 0.02) * (stars + halo)) * pow(max(0.0, 1.22 - r), 1.55);
}

vec3 triangleTessellation(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.4);
  vec2 q = p;
  q *= rot(t * (0.025 + uMotion * 0.09));
  q += vec2(sin(q.y * 3.0 + t * 0.24), cos(q.x * 2.5 - t * 0.2)) * uWarp * 0.11;
  float scale = 5.2 + uBars * 0.025;
  vec2 basis = vec2(q.x + q.y * 0.57735027, q.y * 1.15470054) * scale;
  vec2 cell = floor(basis);
  vec2 f = fract(basis);
  float flip = step(1.0, f.x + f.y);
  vec2 tri = mix(f, 1.0 - f, flip) - 0.333;
  float id = cell.x * 0.173 + cell.y * 0.271 + flip * 0.419;
  float bin = spectrum(fract(id + hash(cell) * 0.23));
  float edgeA = min(min(f.x, f.y), abs(1.0 - f.x - f.y));
  float edgeB = min(min(1.0 - f.x, 1.0 - f.y), abs(f.x + f.y - 1.0));
  float edge = smoothstep(0.018 + mid * 0.014, 0.0, mix(edgeA, edgeB, flip));
  float fill = smoothstep(0.28 + bin * 0.18 + low * 0.08 + future * 0.08, 0.0, length(tri));
  float pulse = smoothstep(0.93, 1.0, sin((cell.x * 1.4 + cell.y * 1.9) - t * (1.1 + uMotion * 1.8) + bin * 5.0));
  float trace = smoothstep(0.024, 0.0, abs(fract((basis.x - basis.y) * 0.5 - t * (0.18 + uMotion * 0.4)) - 0.5)) * (0.05 + high * 0.22);
  float centerGlow = pow(max(0.0, 1.0 - length(p) * (1.05 + uCenter * 0.45)), 2.7) * (0.12 + low * 0.65 + future * 0.28);
  float vignette = pow(max(0.0, 1.18 - length(p * vec2(0.88, 1.04))), 1.5);
  return paletteRamp(id + bin * 0.28 + t * 0.018) * (edge * (0.34 + bin * 1.6) + fill * (0.1 + uBloom * 0.42) + pulse * (0.18 + high) + trace + centerGlow) * vignette;
}

vec3 spectralTerrain(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(2.2);
  vec2 q = p;
  q.x += sin(q.y * 2.6 + t * 0.22) * uWarp * 0.2;
  q.y += 0.12 + low * 0.08;

  float horizon = -0.18 + future * 0.16 + sin(t * 0.17 + uSeed) * 0.04;
  float field = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float z = fi / 8.0;
    float depth = 1.0 - z;
    float width = mix(0.18, 1.55, z);
    float yBase = horizon - z * (0.08 + uCenter * 0.045);
    float x = q.x / max(0.18, width) + 0.5;
    float bin = spectrum(fract(x * (0.72 + z * 0.42) + z * 0.19));
    float ridge = yBase + pow(bin, 0.72) * (0.16 + uEnergy * 0.34) * depth + sin(q.x * (3.0 + z * 7.0) + t * (0.35 + uMotion) + bin * 4.0) * uWarp * 0.055 * depth;
    float line = smoothstep(0.018 + mid * 0.022, 0.0, abs(q.y - ridge));
    float fill = smoothstep(ridge - 0.32 * depth, ridge, q.y) * smoothstep(ridge + 0.018, ridge - 0.02, q.y);
    float grid = smoothstep(0.022, 0.0, abs(fract((q.x / width + z * 0.3) * (4.0 + uBars * 0.024)) - 0.5)) * fill;
    field += (line * (0.55 + bin * 1.9) + grid * (0.06 + high * 0.22)) * depth;
    glow += exp(-abs(q.y - ridge) * (8.0 + uBloom * 16.0)) * (0.02 + bin * 0.055) * depth;
  }

  float sun = exp(-length((q - vec2(0.0, horizon + 0.36 + future * 0.1)) * vec2(1.1, 0.82)) * (4.5 + uCenter * 4.0)) * (0.18 + low * 0.72 + future * 0.55);
  float scan = smoothstep(0.985, 1.0, sin((q.y - horizon) * (34.0 + uBars * 0.08) - t * (1.0 + uMotion * 2.0))) * smoothstep(horizon - 0.8, horizon + 0.28, q.y) * (0.08 + high * 0.28);
  float vignette = pow(max(0.0, 1.22 - length(p * vec2(0.78, 1.0))), 1.5);
  return paletteRamp(q.y * 0.18 + field * 0.1 + t * 0.015) * (field + glow * (1.0 + uBloom * 2.6) + sun + scan) * vignette;
}

vec3 glyphReactor(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(0.9);
  vec2 q = p * rot(sin(t * 0.11 + uSeed) * 0.1);
  q += vec2(sin(q.y * 2.4 + t * 0.32), cos(q.x * 2.0 - t * 0.26)) * uWarp * 0.1;
  float scale = 7.0 + floor(uBars / 30.0);
  vec2 g = q * scale;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float id = hash(cell + floor(uSeed * 0.001));
  float bin = spectrum(fract(id * 0.72 + cell.x * 0.019 + cell.y * 0.031));
  float gate = smoothstep(0.34 - future * 0.16, 1.0, bin + high * 0.28 + hash(cell + floor(t * (1.0 + uMotion))) * 0.32);
  vec2 w = f * rot((id - 0.5) * TAU + t * (0.08 + uMotion * 0.24) * mix(-1.0, 1.0, step(0.5, id)));

  float barA = smoothstep(0.03 + mid * 0.018, 0.0, abs(sdBox(w, vec2(0.26 + bin * 0.12, 0.018 + high * 0.024))));
  float barB = smoothstep(0.026 + mid * 0.014, 0.0, abs(sdBox(w * rot(PI * 0.5), vec2(0.22 + low * 0.12, 0.014 + bin * 0.026))));
  float slash = smoothstep(0.022 + mid * 0.012, 0.0, abs(sdBox(w * rot(0.78), vec2(0.3, 0.01 + high * 0.02))));
  float ring = smoothstep(0.03 + mid * 0.018, 0.0, abs(length(w) - (0.18 + bin * 0.14 + future * 0.05)));
  float dotNode = smoothstep(0.07 + bin * 0.035, 0.0, length(w - vec2(sin(id * TAU), cos(id * TAU)) * 0.18)) * (0.2 + high);
  float glyph = mix(barA + slash, ring + barB, step(0.5, id)) + dotNode;
  float gutters = min(abs(fract(g.x) - 0.5), abs(fract(g.y) - 0.5));
  float matrix = smoothstep(0.016, 0.0, gutters) * (0.04 + future * 0.18);
  float shock = smoothstep(0.04 + mid * 0.025, 0.0, abs(length(q) - fract(t * (0.28 + uMotion * 0.36) + id * 0.2) * 1.25)) * (0.12 + low * 0.5);
  float vignette = pow(max(0.0, 1.18 - length(p * vec2(0.9, 1.0))), 1.6);
  return paletteRamp(id + bin * 0.32 + t * 0.016) * ((glyph * gate) * (0.42 + bin * 1.7 + uBloom) + matrix + shock) * vignette;
}

vec3 foldedMesh(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.6);
  vec2 q = p;
  q *= rot(t * (0.025 + uMotion * 0.11) + future * 0.2);
  q += vec2(fbm(q * 1.7 + t * 0.03), fbm(q.yx * 1.8 - t * 0.04)) * uWarp * 0.24;
  vec3 color = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 1.0;
    vec2 w = q * rot(fi * 0.39 + sin(uSeed * 0.001 + fi) * 0.25);
    float bin = spectrum(fract(fi * 0.101 + w.x * 0.17 + w.y * 0.09));
    float wave = sin(w.x * (2.0 + fi * 0.58) + t * (0.35 + uMotion * 0.9) + bin * 4.4);
    float fold = abs(w.y + wave * (0.12 + uWarp * 0.18 + low * 0.07) - (fi - 4.5) * 0.115);
    float strand = smoothstep(0.022 + mid * 0.016, 0.0, fold);
    float facet = smoothstep(0.965, 1.0, sin((w.x + w.y) * (5.0 + uBars * 0.028) + fi * 1.9 - t * (0.75 + uMotion))) * strand;
    float bead = smoothstep(0.028 + high * 0.02, 0.0, abs(fract(w.x * (3.0 + fi + uBars * 0.018) + t * (0.22 + uMotion * 0.3)) - 0.5)) * strand;
    color += paletteRamp(fi * 0.1 + bin * 0.35 + w.x * 0.08 + t * 0.014) * (strand * (0.24 + bin * 1.2) + facet * (0.16 + future) + bead * (0.08 + high * 0.8));
  }

  float normal = fbm(q * (3.0 + uWarp * 2.5) + vec2(t * 0.05, -t * 0.04));
  float sheen = smoothstep(0.74, 1.0, normal + high * 0.12) * (0.08 + uBloom * 0.25 + future * 0.22);
  float core = pow(max(0.0, 1.0 - length(q) * (0.96 + uCenter * 0.42)), 2.4) * (0.14 + low * 0.58);
  float vignette = pow(max(0.0, 1.2 - length(p * vec2(0.86, 1.03))), 1.45);
  return (color + paletteRamp(normal + t * 0.012) * (sheen + core)) * vignette;
}

vec3 cymaticPlate(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.05);
  vec2 q = p;
  q *= rot(sin(t * 0.09 + uSeed * 0.001) * 0.18 + future * 0.35);
  q += vec2(sin(q.y * 2.6 + t * 0.28), cos(q.x * 2.3 - t * 0.22)) * uWarp * 0.1;
  float r = length(q);
  float a = atan(q.y, q.x);
  float field = 0.0;
  float ridges = 0.0;
  float nodes = 0.0;

  for (int i = 0; i < 9; i++) {
    float fi = float(i) + 1.0;
    float bin = spectrum(fract(fi * 0.097 + r * 0.28 + a / TAU * 0.18));
    float n = 3.0 + mod(fi + floor(uSeed * 0.01), 9.0);
    float radial = sin(r * (7.0 + fi * 1.85 + uBars * 0.025) - t * (0.55 + uMotion) + bin * 5.0);
    float angular = sin(a * n + t * (0.22 + uMotion * 0.36) * mix(-1.0, 1.0, step(0.5, fract(fi * 0.37))));
    float chladni = radial * angular;
    float line = smoothstep(0.08 + mid * 0.055, 0.0, abs(chladni));
    float bright = smoothstep(0.88 - high * 0.22, 1.0, abs(chladni));
    field += line * (0.11 + bin * 0.32 + future * 0.08) / (0.45 + fi * 0.08);
    ridges += bright * (0.05 + bin * 0.25 + high * 0.18) / fi;
  }

  float sand = hash(floor((q + vec2(1.8)) * (58.0 + uBars * 0.12)));
  nodes = smoothstep(0.986 - high * 0.018 - future * 0.01, 1.0, sand) * (0.1 + high * 0.72);
  float plate = smoothstep(1.18, 0.22, r) * pow(max(0.0, 1.18 - r), 1.55);
  float center = pow(max(0.0, 1.0 - r * (1.5 + uCenter)), 3.0) * (0.15 + low * 0.85);
  float ring = smoothstep(0.022 + mid * 0.02, 0.0, abs(r - (0.38 + low * 0.1 + future * 0.08))) * (0.24 + uBloom);
  return paletteRamp(field * 0.52 + a / TAU + t * 0.014) * (field * (1.6 + uBloom) + ridges + nodes + center + ring) * plate;
}

vec3 lissajousSculpture(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.65);
  vec2 q = p * rot(t * (0.018 + uMotion * 0.07) + future * 0.28);
  q += vec2(fbm(q * 2.0 + t * 0.025), fbm(q.yx * 2.1 - t * 0.03)) * uWarp * 0.12;
  vec3 color = vec3(0.0);

  for (int curve = 0; curve < 4; curve++) {
    float fc = float(curve);
    float ax = 2.0 + mod(fc + floor(uSeed * 0.013), 5.0);
    float ay = 3.0 + mod(fc * 2.0 + floor(uSeed * 0.017), 7.0);
    float phase = t * (0.28 + uMotion * 0.85) + fc * 1.47 + low * 1.5;
    float minD = 9.0;
    float glow = 0.0;
    float spectral = 0.0;
    vec2 prev = vec2(0.0);

    for (int j = 0; j < 56; j++) {
      float u = float(j) / 55.0 * TAU;
      float x = sin(ax * u + phase + future * 0.8);
      float y = sin(ay * u + phase * 0.73 + fc * 0.62);
      float z = cos((ax + ay) * 0.5 * u + phase * 0.54);
      float bin = spectrum(fract(float(j) / 56.0 + fc * 0.17));
      vec2 point = vec2(x, y) * (0.42 + bin * 0.22 + low * 0.08);
      point.x += z * (0.08 + uWarp * 0.16);
      if (j > 0) {
        vec2 pa = q - prev;
        vec2 ba = point - prev;
        float h = clamp(dot(pa, ba) / max(0.0001, dot(ba, ba)), 0.0, 1.0);
        float d = length(pa - ba * h);
        minD = min(minD, d);
        glow += exp(-d * (18.0 + uBloom * 28.0)) * (0.005 + bin * 0.012);
      }
      spectral += bin / 56.0;
      prev = point;
    }

    float line = smoothstep(0.026 + mid * 0.018, 0.0, minD);
    float aura = exp(-minD * (5.0 + uBloom * 8.0)) * (0.035 + future * 0.07 + high * 0.08);
    color += paletteRamp(fc * 0.16 + spectral * 0.65 + t * 0.018) * (line * (0.8 + spectral * 2.1 + high) + aura + glow);
  }

  float crown = smoothstep(0.03 + mid * 0.02, 0.0, abs(length(q) - (0.18 + low * 0.16 + future * 0.08))) * (0.25 + uBloom + low);
  float vignette = pow(max(0.0, 1.2 - length(p * vec2(0.84, 1.05))), 1.5);
  return (color + paletteRamp(length(q) + t * 0.02) * crown) * vignette;
}

vec3 phaseMandala(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(0.7);
  float r = length(p);
  float a = atan(p.y, p.x);
  float symmetry = 8.0 + floor(mod(uSeed, 8.0));
  float sector = TAU / symmetry;
  float foldedA = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 q = vec2(cos(foldedA), sin(foldedA)) * r;
  q *= rot(t * (0.035 + uMotion * 0.13) + low * 0.25);
  q += vec2(sin(q.y * 3.1 + t * 0.28), cos(q.x * 2.7 - t * 0.24)) * (uWarp * 0.12 + future * 0.05);

  float lace = 0.0;
  float glass = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 1.0;
    vec2 w = q * rot(fi * 0.37 + sin(uSeed * 0.002 + fi));
    float bin = spectrum(fract(fi * 0.121 + r * 0.31));
    float flower = abs(sin((foldedA * symmetry + fi * 0.27) * (1.5 + mod(fi, 4.0)) + r * (8.0 + fi * 1.1) - t * (0.5 + uMotion) + bin * 4.0));
    float petal = smoothstep(0.085 + mid * 0.055, 0.0, flower - bin * 0.18 - future * 0.08);
    float polygon = smoothstep(0.026 + mid * 0.018, 0.0, abs(sdRegular(w, 3.0 + mod(fi + symmetry, 6.0), 0.13 + fi * 0.058 + bin * 0.12)));
    lace += petal * (0.1 + bin * 0.34 + high * 0.12) / (0.45 + fi * 0.06);
    glass += polygon * (0.22 + bin * 1.2 + uBloom * 0.25) / fi;
  }

  float core = pow(max(0.0, 1.0 - r * (1.55 + uCenter)), 3.8) * (0.24 + low * 1.25);
  float halo = exp(-abs(r - (0.52 + future * 0.12)) * (6.0 + uBloom * 10.0)) * (0.08 + mid * 0.32);
  float sparkle = smoothstep(0.99 - high * 0.015, 1.0, hash(floor(q * (50.0 + uBars * 0.12)))) * (0.08 + high * 0.7);
  float vignette = pow(max(0.0, 1.18 - r), 1.65);
  return paletteRamp(foldedA / sector + r * 0.42 + lace * 0.18 + t * 0.014) * (lace * 1.8 + glass + core + halo + sparkle) * vignette;
}

vec3 hypercubeLattice(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.35);
  vec2 q = p * rot(t * (0.025 + uMotion * 0.14) + future * 0.4);
  vec3 color = vec3(0.0);

  for (int layer = 0; layer < 7; layer++) {
    float fl = float(layer);
    float depth = fl / 6.0;
    float z = 0.32 + depth * (1.18 + future * 0.35);
    vec2 w = q / z;
    w *= rot((depth - 0.5) * (0.9 + uWarp * 1.4) + t * (0.05 + uMotion * 0.19));
    w += vec2(sin(depth * 5.0 + t * 0.34), cos(depth * 4.0 - t * 0.29)) * (uWarp * 0.08 + future * 0.04);
    float scale = 2.0 + depth * (5.0 + uBars * 0.035);
    vec2 g = w * scale;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float id = hash(cell + fl * 17.0 + floor(uSeed * 0.001));
    float bin = spectrum(fract(id * 0.74 + depth * 0.23));
    float edge = min(abs(f.x), abs(f.y));
    float grid = smoothstep(0.018 + mid * 0.015, 0.0, edge);
    float node = smoothstep(0.06 + bin * 0.03, 0.0, length(f)) * (0.18 + high * 0.9);
    float diagonal = smoothstep(0.018, 0.0, abs(f.x - f.y * mix(-1.0, 1.0, step(0.5, id)))) * smoothstep(0.5, 0.08, length(f)) * (0.06 + bin * 0.45);
    float pulse = smoothstep(0.95, 1.0, sin((cell.x + cell.y + fl) * 1.37 - t * (1.4 + uMotion * 2.2) + bin * 6.0)) * (0.16 + high);
    float fade = (1.0 - depth * 0.58) * smoothstep(1.35, 0.14, length(w));
    color += paletteRamp(depth * 0.34 + id * 0.2 + t * 0.015) * (grid * (0.24 + bin * 1.1) + node + diagonal + pulse * grid) * fade;
  }

  float portal = smoothstep(0.035 + mid * 0.018, 0.0, abs(sdRegular(q, 4.0, 0.32 + low * 0.16 + future * 0.1))) * (0.36 + uBloom + low);
  float fog = fbm(q * (2.4 + uWarp * 2.0) + vec2(t * 0.035, -t * 0.03)) * (0.04 + future * 0.18);
  float vignette = pow(max(0.0, 1.2 - length(p * vec2(0.86, 1.04))), 1.45);
  return (color + paletteRamp(length(q) + t * 0.02) * (portal + fog)) * vignette;
}

vec3 juliaSet(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.2);
  vec2 z = p * rot(t * 0.035 + uSeed * 0.00001) * (1.25 + uWarp * 0.45);
  vec2 c = vec2(-0.745 + 0.065 * sin(t * 0.23 + uSeed * 0.001) + low * 0.055,
                0.19 + 0.055 * cos(t * 0.19) + mid * 0.05 + future * 0.045);
  float escape = 0.0;
  float trap = 4.0;
  for (int i = 0; i < 42; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - (0.42 + high * 0.2)));
    float magnitude = dot(z, z);
    if (magnitude > 64.0) {
      escape = float(i) + 1.0 - log2(max(1.0, log2(magnitude))) * 0.5;
      break;
    }
  }
  float bands = 0.5 + 0.5 * cos(escape * (0.46 + uBars * 0.009) - t * 0.6);
  float edge = escape > 0.0 ? exp(-escape * 0.055) : 0.0;
  float interior = escape == 0.0 ? exp(-trap * (7.0 + uBloom * 12.0)) : 0.0;
  float detail = edge * (0.28 + bands * (0.65 + high * 0.7)) + interior * (0.16 + low * 0.8);
  return paletteRamp(escape * 0.033 + trap * 0.3 + t * 0.012) * detail;
}

vec3 voronoiPulse(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(0.9);
  vec2 q = p * (3.0 + uBars * 0.025);
  q *= rot(t * 0.035);
  vec2 cell = floor(q);
  vec2 local = fract(q);
  float nearest = 10.0;
  float second = 10.0;
  float chosen = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 id = cell + offset;
      float seed = hash(id);
      float bin = spectrum(fract(seed * 0.73 + id.x * 0.037));
      vec2 site = offset + 0.5 + 0.28 * vec2(sin(t * (0.24 + uMotion * 0.42) + seed * TAU),
                                                cos(t * (0.3 + uMotion * 0.34) + hash(id + 7.0) * TAU));
      site += (bin + future) * uWarp * 0.12 * vec2(cos(seed * TAU), sin(seed * TAU));
      float distanceToSite = length(local - site);
      if (distanceToSite < nearest) {
        second = nearest;
        nearest = distanceToSite;
        chosen = bin;
      } else {
        second = min(second, distanceToSite);
      }
    }
  }
  float border = 1.0 - smoothstep(0.015, 0.07 + mid * 0.05, second - nearest);
  float nucleus = exp(-nearest * (8.0 + uCenter * 8.0)) * (0.25 + low + chosen);
  float ripple = pow(0.5 + 0.5 * cos(nearest * (21.0 + uBars * 0.12) - t * (1.1 + uMotion * 2.0)), 8.0);
  float fill = (0.08 + chosen * 0.35 + future * 0.3) * (1.0 - nearest * 0.4);
  float vignette = pow(max(0.0, 1.2 - length(p * vec2(0.75, 1.0))), 1.4);
  return paletteRamp(chosen * 0.72 + cell.x * 0.03 + cell.y * 0.05 + t * 0.015) *
    (border * (0.5 + chosen + high) + nucleus + ripple * (0.06 + mid * 0.35) + fill) * vignette;
}

vec3 logarithmicSpirals(vec2 p, float t) {
  float low = uAudio.x;
  float mid = uAudio.y;
  float high = uAudio.z;
  float future = futureEnergy(1.6);
  float r = max(0.025, length(p));
  float angle = atan(p.y, p.x);
  float logRadius = log(r);
  float arms = 3.0 + floor(hash(vec2(uSeed * 0.00001, 4.7)) * 4.0);
  float twist = 2.4 + uWarp * 3.0 + low * 1.2;
  float phase = angle * arms - logRadius * twist - t * (0.6 + uMotion * 1.4);
  float armDistance = abs(sin(phase * 0.5));
  float bin = spectrum(fract(angle / TAU + 0.5 + r * 0.18));
  float arm = 1.0 - smoothstep(0.015, 0.09 + bin * 0.12 + future * 0.05, armDistance);
  float halo = exp(-armDistance * (5.0 + uBloom * 9.0)) * (0.08 + bin * 0.5);
  float rings = pow(0.5 + 0.5 * cos(logRadius * (11.0 + uBars * 0.07) + t * 0.75), 14.0);
  float stars = smoothstep(0.978 - high * 0.024, 1.0, hash(floor(p * (34.0 + uBars * 0.14))));
  float disk = exp(-r * (1.5 + uCenter)) * (0.09 + low * 0.5 + future * 0.3);
  float falloff = pow(max(0.0, 1.25 - r * 0.72), 1.6);
  return paletteRamp(angle / TAU + r * 0.34 + t * 0.018) *
    (arm * (0.4 + bin * 1.6 + mid) + halo + rings * arm * (0.18 + high * 0.6) + stars * (0.1 + high) + disk) * falloff;
}

vec3 spectrumCrown(vec2 p, float t) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float x = fract(a / TAU + 0.5);
  float bin = spectrum(x);
  float radius = 0.24 + uEnergy * 0.16 + uAudio.x * 0.18;
  float crown = smoothstep(0.018, 0.0, abs(r - radius - bin * (0.14 + uEnergy * 0.42)));
  float tick = smoothstep(0.48, 0.5, abs(fract(x * uBars) - 0.5));
  float mirrorMask = mix(1.0, max(tick, smoothstep(0.018, 0.0, abs(length(vec2(-p.x, p.y)) - radius - bin * 0.36))), uMirror);
  return paletteRamp(x + bin * 0.3 + t * 0.02) * crown * tick * mirrorMask * (1.0 + bin * 2.4 + uBloom * 1.5);
}

void main() {
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (vUv * 2.0 - 1.0) * aspect;
  float t = uTime * (0.55 + uMotion * 1.6);
  p *= 1.0 + uAudio.w * uEnergy * 0.09;
  p += vec2(sin(p.y * 3.0 + t), cos(p.x * 2.7 - t * 0.8)) * uWarp * 0.035 * (0.5 + uAudio.y);

  vec3 sceneColor;
  if (uScene == 1) {
    sceneColor = tunnel(p, t);
  } else if (uScene == 2) {
    sceneColor = radar(p, t);
  } else if (uScene == 3) {
    sceneColor = crystal(p, t);
  } else if (uScene == 4) {
    sceneColor = waveformField(p, t);
  } else if (uScene == 5) {
    sceneColor = orbitGrid(p, t);
  } else if (uScene == 6) {
    sceneColor = eventHorizon(p, t);
  } else if (uScene == 7) {
    sceneColor = prismRain(p, t);
  } else if (uScene == 8) {
    sceneColor = signalBloom(p, t);
  } else if (uScene == 9) {
    sceneColor = barScape(p, t);
  } else if (uScene == 10) {
    sceneColor = sequenceGrid(p, t);
  } else if (uScene == 11) {
    sceneColor = polygonConstellation(p, t);
  } else if (uScene == 12) {
    sceneColor = triangleTessellation(p, t);
  } else if (uScene == 13) {
    sceneColor = spectralTerrain(p, t);
  } else if (uScene == 14) {
    sceneColor = glyphReactor(p, t);
  } else if (uScene == 15) {
    sceneColor = foldedMesh(p, t);
  } else if (uScene == 16) {
    sceneColor = cymaticPlate(p, t);
  } else if (uScene == 17) {
    sceneColor = lissajousSculpture(p, t);
  } else if (uScene == 18) {
    sceneColor = phaseMandala(p, t);
  } else if (uScene == 19) {
    sceneColor = hypercubeLattice(p, t);
  } else if (uScene == 20) {
    sceneColor = juliaSet(p, t);
  } else if (uScene == 21) {
    sceneColor = voronoiPulse(p, t);
  } else if (uScene == 22) {
    sceneColor = logarithmicSpirals(p, t);
  } else {
    sceneColor = nebula(p, t);
  }

  float crownMix = 1.0;
  float centerMix = 1.0;
  if (uScene == 0) {
    crownMix = 0.28;
    centerMix = 0.45;
  } else if (uScene == 1) {
    crownMix = 0.12;
    centerMix = 0.08;
  } else if (uScene == 6) {
    crownMix = 0.08;
    centerMix = 0.18;
  } else if (uScene == 7) {
    crownMix = 0.18;
    centerMix = 0.16;
  } else if (uScene == 9) {
    crownMix = 0.08;
    centerMix = 0.12;
  } else if (uScene == 10 || uScene == 12) {
    crownMix = 0.1;
    centerMix = 0.18;
  } else if (uScene == 11) {
    crownMix = 0.14;
    centerMix = 0.14;
  } else if (uScene == 13) {
    crownMix = 0.08;
    centerMix = 0.16;
  } else if (uScene == 14) {
    crownMix = 0.06;
    centerMix = 0.12;
  } else if (uScene == 15) {
    crownMix = 0.12;
    centerMix = 0.16;
  } else if (uScene == 16) {
    crownMix = 0.06;
    centerMix = 0.12;
  } else if (uScene == 17) {
    crownMix = 0.08;
    centerMix = 0.1;
  } else if (uScene == 18) {
    crownMix = 0.04;
    centerMix = 0.08;
  } else if (uScene == 19) {
    crownMix = 0.08;
    centerMix = 0.12;
  } else if (uScene == 20) {
    crownMix = 0.0;
    centerMix = 0.0;
  } else if (uScene == 21) {
    crownMix = 0.04;
    centerMix = 0.08;
  } else if (uScene == 22) {
    crownMix = 0.06;
    centerMix = 0.06;
  }
  sceneColor += spectrumCrown(p, t) * crownMix;
  sceneColor += paletteRamp(length(p) + t * 0.03) * pow(max(0.0, 1.0 - length(p) * 1.1), 2.4) * uCenter * (0.25 + uAudio.x * 0.8) * centerMix;
  sceneColor *= 0.6 + uEnergy * 1.35;
  sceneColor = pow(sceneColor, vec3(0.86 - uBloom * 0.18));

  float flash = uBeatFlash * clamp(uAudio.w * 0.62, 0.0, 0.24);
  sceneColor += vec3(flash);

  float grain = (hash(gl_FragCoord.xy + uFrame) - 0.5) * uGrain * 0.18;
  sceneColor += grain;

  vec3 previous = texture2D(uPrevious, vUv).rgb;
  float trailMix = uTrails * step(2.0, uFrame) * clamp(0.72 + uMotion * 0.18 - uAudio.w * 0.18, 0.0, 0.9);
  if (uScene == 1) {
    trailMix *= 0.48;
  } else if (uScene == 0) {
    trailMix *= 0.72;
  }
  vec3 color = max(sceneColor, previous * trailMix);
  color *= uColor;
  color = color / (1.0 + color * 0.62);

  gl_FragColor = vec4(color, 1.0);
}
`;

const blitSource = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;

const visualProgram = createProgram(vertexSource, fragmentSource);
const blitProgram = createProgram(vertexSource, blitSource);
const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);
gl.disable(gl.BLEND);

const visualUniforms = uniformLocations(visualProgram, [
  "uResolution",
  "uTime",
  "uSeed",
  "uFrame",
  "uEnergy",
  "uBloom",
  "uCenter",
  "uColor",
  "uSaturation",
  "uWarp",
  "uBars",
  "uMotion",
  "uPredict",
  "uGrain",
  "uMirror",
  "uTrails",
  "uBeatFlash",
  "uTrackProgress",
  "uTrackDuration",
  "uScene",
  "uAudio",
  "uPalette[0]",
  "uSpectrum",
  "uFuture",
  "uPrevious",
]);
const blitUniforms = uniformLocations(blitProgram, ["uTexture"]);
const audioTexture = createByteTexture(AUDIO_BINS, 1, audioTextureData);
const predictTexture = createByteTexture(PREDICT_BINS, 1, predictTextureData);
const feedback = [createFeedbackTarget(), createFeedbackTarget()];

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
  stableSeed = seedState;
  frame = 0;
  random();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  for (const target of feedback) resizeFeedbackTarget(target, width, height);
  frame = 0;
}

async function loadSong(file) {
  if (exporting) stopExport();
  if (!audioContext) {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.86;
    data = new Uint8Array(analyser.frequencyBinCount);
  }

  const token = analysisToken + 1;
  analysisToken = token;
  resetPredictTexture();
  analyzeTrack(file, token);

  if (audio) {
    audio.pause();
    URL.revokeObjectURL(audio.src);
  }
  if (source) source.disconnect();
  mediaElementRecordStream = undefined;

  audio = new Audio();
  audio.src = URL.createObjectURL(file);
  audio.crossOrigin = "anonymous";
  audio.preload = "metadata";
  source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  recordGain = audioContext.createGain();
  recordGain.gain.value = 1;
  recordDestination = audioContext.createMediaStreamDestination();
  source.connect(recordGain);
  recordGain.connect(recordDestination);

  audio.addEventListener("timeupdate", updateTime);
  audio.addEventListener("loadedmetadata", updateTime);
  audio.addEventListener("ended", () => {
    playButton.textContent = "Play";
  });
  audio.addEventListener("waiting", () => {
    if (!exporting) return;
    exportPausedForBuffering = true;
    pauseExportRecording();
  });
  audio.addEventListener("playing", () => {
    if (!exporting) return;
    exportPausedForBuffering = false;
    resumeExportRecording();
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
    predict: Number(controls.predict.value) / 100,
    grain: Number(controls.grain.value) / 100,
    mirror: controls.mirror.checked,
    trails: controls.trails.checked,
    beatFlash: controls.beatFlash.checked,
    scene: sceneIds[sceneSelect.value] ?? 0,
    palette: palettes[paletteSelect.value],
  };
}

function sceneLabel(sceneKey) {
  return sceneSelect.querySelector(`option[value="${sceneKey}"]`)?.textContent || sceneKey;
}

function buildLookDeck() {
  const fragment = document.createDocumentFragment();
  for (const [sceneKey, paletteKey] of lookPresets) {
    const palette = palettes[paletteKey];
    if (!palette || !(sceneKey in sceneIds)) continue;
    const button = document.createElement("button");
    button.className = "look-card";
    button.type = "button";
    button.dataset.scene = sceneKey;
    button.dataset.palette = paletteKey;
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", `${sceneLabel(sceneKey)} with ${paletteKey} palette`);
    button.style.setProperty("--swatch-0", palette[0]);
    button.style.setProperty("--swatch-1", palette[1]);
    button.style.setProperty("--swatch-2", palette[2]);
    button.style.setProperty("--swatch-3", palette[3]);
    button.style.setProperty("--angle", `${24 + sceneIds[sceneKey] * 11}deg`);
    button.style.setProperty("--spin", `${sceneIds[sceneKey] * 23}deg`);
    button.style.setProperty("--hot-x", `${28 + sceneIds[sceneKey] * 13 % 50}%`);
    button.style.setProperty("--hot-y", `${30 + sceneIds[sceneKey] * 17 % 44}%`);

    const preview = document.createElement("span");
    preview.className = "look-preview";
    preview.setAttribute("aria-hidden", "true");

    const meta = document.createElement("span");
    meta.className = "look-meta";
    const name = document.createElement("span");
    name.className = "look-name";
    name.textContent = sceneLabel(sceneKey);
    const swatches = document.createElement("span");
    swatches.className = "look-swatches";
    swatches.setAttribute("aria-hidden", "true");
    for (const color of palette) {
      const swatch = document.createElement("span");
      swatch.className = "look-swatch";
      swatch.style.background = color;
      swatches.append(swatch);
    }
    meta.append(name, swatches);
    button.append(preview, meta);
    button.addEventListener("click", () => selectLook(sceneKey, paletteKey));
    fragment.append(button);
  }
  lookDeck.append(fragment);
  updateLookDeck();
}

function selectLook(sceneKey, paletteKey) {
  sceneSelect.value = sceneKey;
  paletteSelect.value = paletteKey;
  updateLookDeck();
  resetVisualMemory();
}

function updateLookDeck() {
  for (const card of lookDeck.querySelectorAll(".look-card")) {
    const active = card.dataset.scene === sceneSelect.value && card.dataset.palette === paletteSelect.value;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-selected", String(active));
  }
}

function randomLook() {
  const [sceneKey, paletteKey] = lookPresets[Math.floor(Math.random() * lookPresets.length)];
  selectLook(sceneKey, paletteKey);
}

function audioMetrics(now, dt) {
  if (!analyser || !data) {
    fillIdleSpectrum(now);
    const low = 0.08 + Math.sin(now * 0.0011) * 0.025;
    const mid = 0.05 + Math.sin(now * 0.0017 + 1.8) * 0.018;
    const high = 0.04 + Math.sin(now * 0.0023 + 0.6) * 0.014;
    const level = Math.min(1, low * 0.55 + mid * 0.32 + high * 0.22);
    smoothAudio({ low, mid, high, level }, dt);
    smooth = smooth * 0.9 + audioLevels.level * 0.1;
    beat = Math.max(0, beat * Math.pow(0.18, dt), audioLevels.low - smooth * 1.12);
    levelMeter.style.transform = `scaleX(${Math.min(1, level * 2.8)})`;
    return audioLevels;
  }

  analyser.getByteFrequencyData(data);
  smoothAudioTexture(data, dt);
  uploadAudioTexture();
  const low = average(2, 32) / 255;
  const mid = average(32, 160) / 255;
  const high = average(160, 520) / 255;
  const level = Math.min(1, low * 0.55 + mid * 0.32 + high * 0.22);
  smoothAudio({ low, mid, high, level }, dt);
  smooth = smooth * Math.pow(0.02, dt) + audioLevels.level * (1 - Math.pow(0.02, dt));
  beat = Math.max(0, beat * Math.pow(0.12, dt), audioLevels.low - smooth * 1.12);
  levelMeter.style.transform = `scaleX(${Math.min(1, audioLevels.level * 2.8)})`;
  return audioLevels;
}

function visualTime(now) {
  if (audio && (exporting || !audio.paused) && Number.isFinite(audio.currentTime)) {
    return audio.currentTime;
  }
  return now / 1000;
}

function smoothAudio(next, dt) {
  const rise = 1 - Math.exp(-dt * 18);
  const fall = 1 - Math.exp(-dt * 6);
  for (const key of ["low", "mid", "high", "level"]) {
    const alpha = next[key] > audioLevels[key] ? rise : fall;
    audioLevels[key] += (next[key] - audioLevels[key]) * alpha;
  }
}

function smoothAudioTexture(bytes, dt) {
  const rise = 1 - Math.exp(-dt * 24);
  const fall = 1 - Math.exp(-dt * 7);
  const limit = Math.min(AUDIO_BINS, bytes.length);
  for (let i = 0; i < AUDIO_BINS; i += 1) {
    const target = i < limit ? bytes[i] : 0;
    const alpha = target > smoothSpectrum[i] ? rise : fall;
    smoothSpectrum[i] += (target - smoothSpectrum[i]) * alpha;
    audioTextureData[i] = clampByte(smoothSpectrum[i]);
  }
}

function average(start, end) {
  let total = 0;
  const capped = Math.min(end, data.length);
  for (let i = start; i < capped; i += 1) total += data[i];
  return total / Math.max(1, capped - start);
}

function fillIdleSpectrum(now) {
  const t = now * 0.001;
  for (let i = 0; i < AUDIO_BINS; i += 1) {
    const x = i / AUDIO_BINS;
    const wave = Math.sin(x * 18 + t * 1.7) * Math.sin(x * 47 - t * 0.8);
    const falloff = Math.pow(1 - x, 1.6);
    const target = Math.max(0, Math.min(255, Math.floor((20 + wave * 18) * falloff)));
    smoothSpectrum[i] += (target - smoothSpectrum[i]) * 0.08;
    audioTextureData[i] = clampByte(smoothSpectrum[i]);
  }
  uploadAudioTexture();
}

function smoothVisualValues(target, dt) {
  const alpha = 1 - Math.exp(-dt * 5.5);
  for (const key of Object.keys(visualValues)) {
    visualValues[key] += (target[key] - visualValues[key]) * alpha;
  }
  return {
    ...target,
    ...visualValues,
  };
}

function render(now) {
  rafId = requestAnimationFrame(render);
  resize();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  frame += 1 + dt * 0;

  const v = smoothVisualValues(values(), dt);
  const m = audioMetrics(now, dt);
  const current = feedback[feedbackIndex];
  const previous = feedback[1 - feedbackIndex];

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, current.framebuffer);
  gl.useProgram(visualProgram);
  bindQuad(visualProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, audioTexture);
  gl.uniform1i(visualUniforms.uSpectrum, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, predictTexture);
  gl.uniform1i(visualUniforms.uFuture, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, previous.texture);
  gl.uniform1i(visualUniforms.uPrevious, 2);
  gl.uniform2f(visualUniforms.uResolution, canvas.width, canvas.height);
  gl.uniform1f(visualUniforms.uTime, visualTime(now));
  gl.uniform1f(visualUniforms.uSeed, stableSeed);
  gl.uniform1f(visualUniforms.uFrame, frame);
  gl.uniform1f(visualUniforms.uEnergy, v.energy);
  gl.uniform1f(visualUniforms.uBloom, v.bloom);
  gl.uniform1f(visualUniforms.uCenter, v.center);
  gl.uniform1f(visualUniforms.uColor, v.color);
  gl.uniform1f(visualUniforms.uSaturation, v.saturation);
  gl.uniform1f(visualUniforms.uWarp, v.warp);
  gl.uniform1f(visualUniforms.uBars, v.bars);
  gl.uniform1f(visualUniforms.uMotion, v.motion);
  gl.uniform1f(visualUniforms.uPredict, trackAnalysis.ready ? v.predict : 0);
  gl.uniform1f(visualUniforms.uGrain, v.grain);
  gl.uniform1f(visualUniforms.uMirror, v.mirror ? 1 : 0);
  gl.uniform1f(visualUniforms.uTrails, v.trails ? 1 : 0);
  gl.uniform1f(visualUniforms.uBeatFlash, v.beatFlash ? 1 : 0);
  gl.uniform1f(visualUniforms.uTrackProgress, trackProgress());
  gl.uniform1f(visualUniforms.uTrackDuration, trackAnalysis.duration || audio?.duration || 0);
  gl.uniform1i(visualUniforms.uScene, v.scene);
  gl.uniform4f(visualUniforms.uAudio, m.low, m.mid, m.high, beat);
  gl.uniform4fv(visualUniforms["uPalette[0]"], paletteFloats(v.palette, v));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(blitProgram);
  bindQuad(blitProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, current.texture);
  gl.uniform1i(blitUniforms.uTexture, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.flush();

  updateOverlayPreview(m, now);

  if (exporting && mediaRecorder?.state === "recording" && !document.hidden &&
      audio && !audio.paused && audio.currentTime - lastExportCaptureTime >= 1 / EXPORT_FPS) {
    compositeExportFrame(m, now);
    captureTrack?.requestFrame?.();
    lastExportCaptureTime = audio.currentTime;
  }

  feedbackIndex = 1 - feedbackIndex;
}

function createProgram(vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Unable to link shader program.");
  }
  return program;
}

function compileShader(type, sourceText) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, sourceText);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile shader.");
  }
  return shader;
}

function uniformLocations(program, names) {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
}

function bindQuad(program) {
  const position = gl.getAttribLocation(program, "aPosition");
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
}

function createByteTexture(width, height, pixels) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
  return texture;
}

function uploadAudioTexture() {
  gl.bindTexture(gl.TEXTURE_2D, audioTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, AUDIO_BINS, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, audioTextureData);
}

function resetPredictTexture() {
  predictTextureData.fill(0);
  trackAnalysis = { duration: 0, ready: false };
  uploadPredictTexture();
}

function uploadPredictTexture() {
  gl.bindTexture(gl.TEXTURE_2D, predictTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PREDICT_BINS, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, predictTextureData);
}

async function analyzeTrack(file, token) {
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
    if (token !== analysisToken) return;
    buildPredictTexture(decoded);
    trackAnalysis = { duration: decoded.duration, ready: true };
    uploadPredictTexture();
  } catch (error) {
    if (token === analysisToken) resetPredictTexture();
    console.warn("Unable to build predictive audio envelope.", error);
  }
}

function buildPredictTexture(buffer) {
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channels.push(buffer.getChannelData(c));
  }
  const sampleCount = buffer.length;
  const binSamples = Math.max(1, Math.floor(sampleCount / PREDICT_BINS));
  const raw = new Float32Array(PREDICT_BINS);
  let peak = 0.0001;

  for (let i = 0; i < PREDICT_BINS; i += 1) {
    const start = Math.min(sampleCount - 1, i * binSamples);
    const end = Math.min(sampleCount, i === PREDICT_BINS - 1 ? sampleCount : start + binSamples);
    let sum = 0;
    let localPeak = 0;
    let count = 0;
    const stride = Math.max(1, Math.floor((end - start) / 96));
    for (let s = start; s < end; s += stride) {
      let sample = 0;
      for (const channel of channels) sample += channel[s] || 0;
      sample /= Math.max(1, channels.length);
      const abs = Math.abs(sample);
      sum += abs * abs;
      localPeak = Math.max(localPeak, abs);
      count += 1;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    raw[i] = rms * 0.72 + localPeak * 0.28;
    peak = Math.max(peak, raw[i]);
  }

  let smoothed = 0;
  for (let i = 0; i < PREDICT_BINS; i += 1) {
    const normalized = Math.min(1, raw[i] / peak);
    smoothed += (normalized - smoothed) * (normalized > smoothed ? 0.42 : 0.16);
    predictTextureData[i] = clampByte(Math.pow(smoothed, 0.72) * 255);
  }
}

function trackProgress() {
  const duration = trackAnalysis.duration || audio?.duration || 0;
  if (!audio || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, audio.currentTime / duration));
}

function createFeedbackTarget() {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  return { texture, framebuffer, width: 0, height: 0 };
}

function resizeFeedbackTarget(target, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Unable to create WebGL feedback buffer.");
  }
  target.width = width;
  target.height = height;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function paletteFloats(palette, v) {
  return new Float32Array(palette.flatMap((hex) => {
    const color = toneColor(hex, v);
    return [color.r / 255, color.g / 255, color.b / 255, 1];
  }));
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

function prepareExportCanvas() {
  if (exportCanvas.width !== EXPORT_WIDTH || exportCanvas.height !== EXPORT_HEIGHT) {
    exportCanvas.width = EXPORT_WIDTH;
    exportCanvas.height = EXPORT_HEIGHT;
  }
}

function compositeExportFrame(metrics = audioLevels, now = performance.now()) {
  prepareExportCanvas();
  exportContext.save();
  exportContext.globalAlpha = 1;
  exportContext.globalCompositeOperation = "source-over";
  exportContext.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportContext.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  drawOverlay(exportContext, exportCanvas.width, exportCanvas.height, metrics, now);
  if (controls.exportHud.checked) drawExportHud(metrics);
  exportContext.restore();
}

function drawOverlay(context, width, height, metrics = audioLevels, now = performance.now()) {
  if (!overlayImage || !overlayImage.naturalWidth || !overlayImage.naturalHeight) return;
  const box = overlayBox(width, height);
  const motion = overlayMotion(box, width, height, metrics, now);
  context.save();
  context.globalAlpha = Number(overlayOpacity.value) / 100;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(box.x + box.width / 2 + motion.x, box.y + box.height / 2 + motion.y);
  context.rotate(motion.rotation);
  context.scale(motion.scale, motion.scale);
  context.drawImage(overlayImage, -box.width / 2, -box.height / 2, box.width, box.height);
  context.restore();
}

function overlayBox(width, height) {
  const maxWidth = width * (Number(overlaySize.value) / 100);
  const maxHeight = height * 0.42;
  const sourceWidth = overlayImage?.naturalWidth || 1;
  const sourceHeight = overlayImage?.naturalHeight || 1;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const overlayWidth = Math.max(1, sourceWidth * scale);
  const overlayHeight = Math.max(1, sourceHeight * scale);
  const margin = width * 0.035;
  const verticalMargin = height * 0.055;
  const positions = {
    "top-left": [margin, verticalMargin],
    "top-right": [width - margin - overlayWidth, verticalMargin],
    "bottom-left": [margin, height - verticalMargin - overlayHeight],
    "bottom-right": [width - margin - overlayWidth, height - verticalMargin - overlayHeight],
    center: [(width - overlayWidth) / 2, (height - overlayHeight) / 2],
  };
  const [x, y] = positions[overlayPosition.value] ?? positions["top-right"];
  return { x, y, width: overlayWidth, height: overlayHeight };
}

function overlayMotion(box, width, height, metrics = audioLevels, now = performance.now()) {
  const life = Number(overlayLife.value) / 100;
  if (life <= 0) return { x: 0, y: 0, rotation: 0, scale: 1 };

  const t = now * 0.001;
  const seedPhase = (stableSeed % 997) / 997 * Math.PI * 2;
  const beatPulse = Math.max(0, beat) * life;
  const levelPulse = Math.max(0, metrics?.level ?? 0) * life;
  const driftLimit = Math.min(width, height) * 0.018 * life;
  const centerBiasX = box.x + box.width / 2 < width * 0.5 ? 1 : -1;
  const centerBiasY = box.y + box.height / 2 < height * 0.5 ? 1 : -1;

  return {
    x: (Math.sin(t * 0.47 + seedPhase) * 0.72 + Math.sin(t * 0.19 + seedPhase * 1.7) * 0.28) * driftLimit * centerBiasX,
    y: (Math.cos(t * 0.41 + seedPhase * 0.83) * 0.68 + Math.sin(t * 0.23 + seedPhase) * 0.32) * driftLimit * centerBiasY,
    rotation: (Math.sin(t * 0.33 + seedPhase) * 1.1 + beatPulse * 0.85) * life * Math.PI / 180,
    scale: 1 + levelPulse * 0.018 + beatPulse * 0.035,
  };
}

function updateOverlayPreview(metrics = audioLevels, now = performance.now()) {
  if (!overlayImage || !overlayUrl) {
    overlayPreview.hidden = true;
    clearOverlay.disabled = true;
    return;
  }
  const stage = canvas.getBoundingClientRect();
  const width = Math.max(1, stage.width);
  const height = Math.max(1, stage.height);
  const box = overlayBox(width, height);
  const motion = overlayMotion(box, width, height, metrics, now);
  overlayPreview.hidden = false;
  clearOverlay.disabled = false;
  overlayPreview.src = overlayUrl;
  overlayPreview.style.left = `${box.x}px`;
  overlayPreview.style.top = `${box.y}px`;
  overlayPreview.style.width = `${box.width}px`;
  overlayPreview.style.height = `${box.height}px`;
  overlayPreview.style.opacity = String(Number(overlayOpacity.value) / 100);
  overlayPreview.style.transform = `translate(${motion.x}px, ${motion.y}px) rotate(${motion.rotation}rad) scale(${motion.scale})`;
}

function drawExportHud(metrics) {
  const width = exportCanvas.width;
  const height = exportCanvas.height;
  const scale = Math.max(1, width / Math.max(1, canvas.clientWidth || width));
  const margin = 20 * scale;
  const bottom = height - 18 * scale;
  const labelSize = 13 * scale;
  const timeSize = 20 * scale;
  const maxTextWidth = Math.min(520 * scale, width * 0.54);

  exportContext.save();
  exportContext.textBaseline = "alphabetic";
  exportContext.shadowColor = "rgba(0, 0, 0, 0.72)";
  exportContext.shadowBlur = 10 * scale;
  exportContext.shadowOffsetY = 2 * scale;

  exportContext.font = `500 ${labelSize}px Inter, system-ui, sans-serif`;
  exportContext.fillStyle = "rgba(244, 247, 251, 0.86)";
  exportContext.fillText(fitText(trackName.textContent, maxTextWidth, exportContext), margin, bottom - 27 * scale);

  exportContext.font = `800 ${timeSize}px Inter, system-ui, sans-serif`;
  exportContext.fillStyle = "rgba(244, 247, 251, 0.92)";
  exportContext.fillText(fitText(timeReadout.textContent, maxTextWidth, exportContext), margin, bottom);

  const meterWidth = Math.min(220 * scale, width * 0.28);
  const meterHeight = 8 * scale;
  const meterX = width - margin - meterWidth;
  const meterY = bottom - meterHeight;
  roundedRect(exportContext, meterX, meterY, meterWidth, meterHeight, meterHeight / 2);
  exportContext.fillStyle = "rgba(255, 255, 255, 0.12)";
  exportContext.fill();

  const level = Math.max(0, Math.min(1, (metrics?.level ?? 0) * 2.8));
  exportContext.save();
  roundedRect(exportContext, meterX, meterY, meterWidth * level, meterHeight, meterHeight / 2);
  exportContext.clip();
  const gradient = exportContext.createLinearGradient(meterX, 0, meterX + meterWidth, 0);
  gradient.addColorStop(0, "#0cf2ff");
  gradient.addColorStop(0.52, "#fff95b");
  gradient.addColorStop(1, "#ff2bd6");
  exportContext.fillStyle = gradient;
  exportContext.fillRect(meterX, meterY, meterWidth, meterHeight);
  exportContext.restore();
  exportContext.restore();
}

function fitText(text, maxWidth, context) {
  const value = text || "";
  if (context.measureText(value).width <= maxWidth) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (context.measureText(`${value.slice(0, mid)}...`).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${value.slice(0, Math.max(0, low))}...`;
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
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

function audioFileFromTransfer(dataTransfer) {
  return Array.from(dataTransfer?.files || []).find((file) => (
    file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name)
  ));
}

function setSongDropActive(active) {
  songDrop.classList.toggle("is-dragging", active);
  stage.classList.toggle("is-dragging", active);
}

songInput.addEventListener("change", () => {
  const [file] = songInput.files;
  if (file) loadSong(file);
});

for (const target of [songDrop, stage]) {
  target.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSongDropActive(true);
  });

  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setSongDropActive(true);
  });

  target.addEventListener("dragleave", (event) => {
    event.stopPropagation();
    if (!target.contains(event.relatedTarget)) setSongDropActive(false);
  });

  target.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSongDropActive(false);
    const file = audioFileFromTransfer(event.dataTransfer);
    if (file) loadSong(file);
  });
}

overlayInput.addEventListener("change", () => {
  const [file] = overlayInput.files;
  if (!file) return;
  if (overlayUrl) URL.revokeObjectURL(overlayUrl);
  overlayUrl = URL.createObjectURL(file);
  overlayImage = new Image();
  overlayImage.addEventListener("load", updateOverlayPreview, { once: true });
  overlayImage.src = overlayUrl;
});

clearOverlay.addEventListener("click", () => {
  if (overlayUrl) URL.revokeObjectURL(overlayUrl);
  overlayUrl = undefined;
  overlayImage = undefined;
  overlayInput.value = "";
  updateOverlayPreview();
});

overlayPosition.addEventListener("change", updateOverlayPreview);
overlaySize.addEventListener("input", updateOverlayPreview);
overlayOpacity.addEventListener("input", updateOverlayPreview);
overlayLife.addEventListener("input", updateOverlayPreview);

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

remixButton.addEventListener("click", remixLook);
randomLookButton.addEventListener("click", randomLook);

function remixLook() {
  const sceneKeys = Object.keys(sceneIds);
  const paletteKeys = Object.keys(palettes);
  seedInput.value = Math.random().toString(36).slice(2, 10);
  sceneSelect.value = sceneKeys[Math.floor(Math.random() * sceneKeys.length)];
  paletteSelect.value = paletteKeys[Math.floor(Math.random() * paletteKeys.length)];
  setRange(controls.energy, randomInt(58, 94));
  setRange(controls.bloom, randomInt(50, 92));
  setRange(controls.center, randomInt(28, 72));
  setRange(controls.color, randomInt(86, 132));
  setRange(controls.saturation, randomInt(82, 150));
  setRange(controls.warp, randomInt(24, 82));
  setRange(controls.bars, randomInt(48, 176));
  setRange(controls.motion, randomInt(34, 82));
  setRange(controls.predict, randomInt(18, 72));
  setRange(controls.grain, randomInt(6, 30));
  controls.mirror.checked = Math.random() > 0.28;
  controls.trails.checked = Math.random() > 0.12;
  controls.beatFlash.checked = Math.random() > 0.35;
  reseed();
  updateLookDeck();
  resetVisualMemory();
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function setRange(input, value) {
  input.value = String(value);
  const output = input.parentElement.querySelector("output");
  if (output) {
    output.value = input.value;
    output.textContent = input.value;
  }
}

function canRecord() {
  return Boolean(window.MediaRecorder && exportCanvas.captureStream);
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
  exportPausedForVisibility = false;
  exportPausedForBuffering = false;
  lastExportCaptureTime = -Infinity;
  exportButton.textContent = "Stop Export";
  playButton.disabled = true;

  audio.pause();
  audio.currentTime = 0;
  prepareExportFadeIn();
  updateTime();

  prepareExportCanvas();
  compositeExportFrame(audioLevels, performance.now());

  const videoStream = exportCanvas.captureStream(0);
  captureTrack = videoStream.getVideoTracks()[0];
  if (!captureTrack?.requestFrame) {
    videoStream.getTracks().forEach((track) => track.stop());
    captureTrack = undefined;
    const fallbackStream = exportCanvas.captureStream(EXPORT_FPS);
    captureTrack = fallbackStream.getVideoTracks()[0];
    await startRecorder(fallbackStream);
    return;
  }

  await startRecorder(videoStream);
}

async function startRecorder(videoStream) {
  const audioTracks = recorderAudioTracks();
  audioTracks.forEach((track) => {
    track.enabled = true;
  });
  if (!audioTracks.length) {
    videoStream.getTracks().forEach((track) => track.stop());
    exporting = false;
    exportButton.textContent = "Export Video";
    playButton.disabled = false;
    resetRecordGain();
    throw new Error("Unable to export: no audio track is available for the recorder.");
  }

  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioTracks,
  ]);
  const options = preferredRecorderOptions();
  mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => finishExport(stream));
  audio.addEventListener("ended", stopExport, { once: true });
  mediaRecorder.start(1000);
  captureTrack?.requestFrame?.();
  try {
    await audio.play();
    startExportFadeIn();
    playButton.textContent = "Pause";
    if (document.hidden) {
      exportPausedForVisibility = true;
      pauseExportRecording();
      audio.pause();
    }
  } catch (error) {
    stopExport();
    throw error;
  }
}

function recorderAudioTracks() {
  const captureMediaElement = audio?.captureStream || audio?.mozCaptureStream;
  if (captureMediaElement) {
    mediaElementRecordStream = captureMediaElement.call(audio);
    const tracks = mediaElementRecordStream.getAudioTracks();
    if (tracks.length) return tracks.map((track) => track.clone());
  }

  return (recordDestination?.stream.getAudioTracks() ?? []).map((track) => track.clone());
}

function stopExport() {
  if (!exporting || !mediaRecorder) return;
  exporting = false;
  exportPausedForVisibility = false;
  exportPausedForBuffering = false;
  exportButton.textContent = "Export Video";
  if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

function pauseExportRecording() {
  if (mediaRecorder?.state === "recording") mediaRecorder.pause();
}

function resumeExportRecording() {
  if (exporting && !exportPausedForVisibility && !exportPausedForBuffering &&
      mediaRecorder?.state === "paused") {
    mediaRecorder.resume();
    lastExportCaptureTime = -Infinity;
  }
}

document.addEventListener("visibilitychange", () => {
  if (!exporting || !audio) return;
  if (document.hidden) {
    exportPausedForVisibility = true;
    pauseExportRecording();
    audio.pause();
  } else if (exportPausedForVisibility) {
    exportPausedForVisibility = false;
    resumeExportRecording();
    audio.play().catch((error) => {
      console.error("Unable to resume export playback.", error);
      stopExport();
    });
  }
});

function finishExport(stream) {
  stream.getTracks().forEach((track) => track.stop());
  exporting = false;
  exportButton.textContent = "Export Video";
  const mimeType = mediaRecorder.mimeType || "video/webm";
  const blob = new Blob(recordedChunks, { type: mimeType });
  const safeName = (trackName.textContent || "seesound")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "seesound";
  exportUrl = URL.createObjectURL(blob);
  downloadLink.href = exportUrl;
  downloadLink.download = `${safeName}-seesound.${extensionForMime(mimeType)}`;
  downloadLink.hidden = false;
  playButton.disabled = false;
  mediaRecorder = undefined;
  captureTrack = undefined;
  resetRecordGain();
}

function prepareExportFadeIn() {
  if (!recordGain || !audioContext) return;
  const now = audioContext.currentTime;
  recordGain.gain.cancelScheduledValues(now);
  recordGain.gain.setValueAtTime(0, now);
}

function startExportFadeIn() {
  if (!recordGain || !audioContext) return;
  const now = audioContext.currentTime;
  recordGain.gain.cancelScheduledValues(now);
  recordGain.gain.setValueAtTime(0, now);
  recordGain.gain.linearRampToValueAtTime(1, now + EXPORT_FADE_IN_SECONDS);
}

function resetRecordGain() {
  if (!recordGain || !audioContext) return;
  const now = audioContext.currentTime;
  recordGain.gain.cancelScheduledValues(now);
  recordGain.gain.setValueAtTime(1, now);
}

function preferredRecorderOptions() {
  const choices = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mimeType = choices.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 } : {};
}

function extensionForMime(mimeType) {
  return mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
}

seedInput.addEventListener("input", reseed);
sceneSelect.addEventListener("change", () => {
  updateLookDeck();
  resetVisualMemory();
});
paletteSelect.addEventListener("change", () => {
  updateLookDeck();
  resetVisualMemory();
});
window.addEventListener("resize", () => {
  resize();
  updateOverlayPreview();
});

for (const input of document.querySelectorAll("input[type='range']")) {
  const output = input.parentElement.querySelector("output");
  input.addEventListener("input", () => {
    output.value = input.value;
    output.textContent = input.value;
  });
}

buildLookDeck();
resize();
reseed();
rafId = requestAnimationFrame(render);

function resetVisualMemory() {
  frame = 0;
  feedbackIndex = 0;
}
