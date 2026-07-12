# SeeSound

SeeSound is a local music-video visualizer. It runs a small Go web server and uses WebGL plus Web Audio to render seeded real-time visuals from a song file on your machine.

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
4. Tune scene, palette, energy, bloom, center brightness, color strength, saturation, warp, bar count, motion, grain, mirror, trails, and beat flash.
5. Press **Play** to preview the generated visualizer live.
6. Press **Export Video** to record the full song as a uniform 1920x1080 video and reveal a local download link when rendering finishes. The browser chooses the best supported container, preferring MP4 when available and falling back to WebM.

Audio stays local in the browser. The Go server only serves the app files.
