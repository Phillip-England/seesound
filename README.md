# SeeSound

SeeSound is a local music-video visualizer. It runs a small Go web server and uses browser Canvas plus Web Audio to render seeded real-time visuals from a song file on your machine.

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
3. Tune scene, palette, energy, bloom, center brightness, color strength, saturation, warp, bar count, motion, grain, mirror, trails, and beat flash.
4. Press **Play** to preview the generated visualizer live.
5. Press **Export WebM** to record the full song and reveal a local download link when rendering finishes.

Audio stays local in the browser. The Go server only serves the app files.
