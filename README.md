# SeeSound

SeeSound is a local music-video visualizer for mathematically driven track visuals. It runs a small Go web server and uses WebGL plus Web Audio to render seeded, exportable scenes from a song file on your machine.

## Install

```sh
make install
```

## Run

```sh
make run
```

Open http://127.0.0.1:8787.

You can choose another port:

```sh
make run PORT=9000
```

## Use

1. Load an audio file with **Load Song**.
2. Set a seed or shuffle one.
3. Optionally load a logo or other image overlay, then set its position, size, and opacity.
4. Pick a starting point from Visual Systems, use Surprise for a fast scene and palette switch, or tune scene, palette, energy, bloom, center brightness, color strength, saturation, warp, bar count, motion, predictive foreshadowing, grain, mirror, trails, and beat flash by hand. Scene choices include flowing fields, tunnels, waveforms, orbital grids, spectral terrain, folded meshes, cymatic interference plates, Lissajous sculptures, phase mandalas, hypercube lattices, Julia sets, Voronoi cells, and logarithmic spirals.
5. Press **Play** to preview the generated visualizer live.
6. Press **Export Video** to record the full song as a uniform 1920x1080 video and reveal a local download link when rendering finishes. The browser chooses the best supported container, preferring MP4 when available and falling back to WebM.

Audio stays local in the browser. The Go server only serves the app files.
