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
};

const sceneIds = {
  nebula: 0,
  tunnel: 1,
  radar: 2,
  crystal: 3,
  waveform: 4,
  orbit: 5,
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
let frame = 0;
let feedbackIndex = 0;
let overlayImage;
let overlayUrl;

const EXPORT_FADE_IN_SECONDS = 0.08;
const EXPORT_FPS = 30;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const AUDIO_BINS = 1024;
const audioTextureData = new Uint8Array(AUDIO_BINS);
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
  grain: 0.2,
};

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
uniform float uGrain;
uniform float uMirror;
uniform float uTrails;
uniform float uBeatFlash;
uniform int uScene;
uniform vec4 uAudio;
uniform vec4 uPalette[4];
uniform sampler2D uSpectrum;
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
  "uGrain",
  "uMirror",
  "uTrails",
  "uBeatFlash",
  "uScene",
  "uAudio",
  "uPalette[0]",
  "uSpectrum",
  "uPrevious",
]);
const blitUniforms = uniformLocations(blitProgram, ["uTexture"]);
const audioTexture = createByteTexture(AUDIO_BINS, 1, audioTextureData);
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
    scene: sceneIds[sceneSelect.value] ?? 0,
    palette: palettes[paletteSelect.value],
  };
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
  gl.bindTexture(gl.TEXTURE_2D, previous.texture);
  gl.uniform1i(visualUniforms.uPrevious, 1);
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
  gl.uniform1f(visualUniforms.uGrain, v.grain);
  gl.uniform1f(visualUniforms.uMirror, v.mirror ? 1 : 0);
  gl.uniform1f(visualUniforms.uTrails, v.trails ? 1 : 0);
  gl.uniform1f(visualUniforms.uBeatFlash, v.beatFlash ? 1 : 0);
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

  if (exporting) {
    compositeExportFrame(m, now);
  }

  if (exporting && captureTrack?.requestFrame) {
    captureTrack.requestFrame();
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
  setRange(controls.grain, randomInt(6, 30));
  controls.mirror.checked = Math.random() > 0.28;
  controls.trails.checked = Math.random() > 0.12;
  controls.beatFlash.checked = Math.random() > 0.35;
  reseed();
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
  exportButton.textContent = "Export Video";
  if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

function finishExport(stream) {
  stream.getTracks().forEach((track) => track.stop());
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
sceneSelect.addEventListener("change", resetVisualMemory);
paletteSelect.addEventListener("change", resetVisualMemory);
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

resize();
reseed();
rafId = requestAnimationFrame(render);

function resetVisualMemory() {
  frame = 0;
  feedbackIndex = 0;
}
