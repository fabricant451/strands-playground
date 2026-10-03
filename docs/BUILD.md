# Rebuilding and validation

## Source checkouts

```sh
python3 scripts/setup-sources.py
```

This creates independent `llama.cpp/`, `wllama/`, `wllama/llama.cpp/`, and `strands-decider/` checkouts at the revisions in `manifest.json` and applies `patches/`. It is safe to rerun when the patches are already applied. It refuses to reset an existing checkout with another revision or incompatible changes.

After changing native source, export the patches with `python3 scripts/export-patches.py`. Apply the same llama.cpp changes to the independent `wllama/llama.cpp/` checkout before rebuilding WASM. Exporting patches does not synchronize existing checkouts automatically.

## Python environment and model sources

The recorded development environment uses Python 3.14 on macOS arm64. The lock records that environment; package availability can differ by platform.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
.venv/bin/python scripts/download-models.py --sources
```

Omit `--sources` to download only the published Q8 GGUF. Source downloads include the adapter/head and pinned Qwen backbone. The downloader records the manifest's base revision in the local adapter config so conversion cannot silently select a newer backbone. The base revision was inferred, not recorded by the original training hosts; see the manifest.

## Native build and conversion

```sh
cmake -S llama.cpp -B llama.cpp/build -DCMAKE_BUILD_TYPE=Release -DGGML_METAL=OFF -DLLAMA_BUILD_TESTS=ON
cmake --build llama.cpp/build --target llama-server llama-quantize test-strands -j 2
.venv/bin/python llama.cpp/convert_hf_to_gguf.py models/strands --outfile models/strands-f16.gguf --outtype f16
llama.cpp/build/bin/llama-quantize --max-buffer-size 128 --tensor-type cls.output.weight=f32 models/strands-f16.gguf models/strands-q8_0.gguf Q8_0 2
llama.cpp/build/bin/test-strands models/strands-q8_0.gguf fixtures/reference.json
.venv/bin/python scripts/native_check.py --model models/strands-q8_0.gguf --tolerance 0.03
```

The converter merges the adapter and preserves the pointer head and decision metadata. For native WebGPU, configure a separate build with `-DGGML_WEBGPU=ON -DDawn_DIR=/path/to/Dawn/lib/cmake/Dawn`, then use `native_check.py --binary PATH/llama-server --gpu-layers 99 --tolerance 0.03`.

To regenerate the Python reference, use `.venv/bin/python scripts/reference.py --limit 0`. The default uses MPS and bfloat16 with async Hugging Face loading disabled. CPU reference inference requires `--device cpu --dtype float32` and more memory.

## Single-thread browser runtime

Install CMake, Node.js 22, npm, and Emscripten SDK 4.0.23. Download and extract the [Dawn WebGPU package v20260317.182325](https://github.com/google/dawn/releases/download/v20260317.182325/emdawnwebgpu_pkg-v20260317.182325.zip).

```sh
export EMSDK=/path/to/emsdk
export EMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg
bash scripts/build-wllama.sh
```

The script configures `WLLAMA_THREADS=OFF`, `GGML_WEBGPU=ON`, and `GGML_WEBGPU_JSPI=ON`, builds with two compiler jobs, regenerates worker code, and copies the resulting runtime into `site/`. The committed binaries were built with this toolchain on macOS arm64; other build platforms have not been verified.

Do not use the upstream Docker build script for this demo: its default enables pthreads. One Web Worker still keeps WASM orchestration off the UI thread; all model layers are requested on WebGPU.

## Browser checks and memory limits

Run heavyweight steps one at a time. On macOS, wrap builds or model runs with the included memory guard, for example:

```sh
.venv/bin/python scripts/guard.py --name wasm-build --max-gib 3 -- bash scripts/build-wllama.sh
.venv/bin/python scripts/guard.py --name browser-check --max-gib 6 -- node scripts/browser-check.mjs
```

The local full-browser check expects the built runtime in `wllama/esm` and `models/strands-q8_0.gguf`. It serves root source files and checks full GPU offload, no SharedArrayBuffer, the three-question request, eight reference fixtures, a repeated request and unload. Reports and the browser profile are written under ignored `reports/`.

For the deployed site, set `BROWSER_URL=https://fabricant451.github.io/strands-playground/` before the guard command. This can download the model again for that origin. No live inference run is part of CI.

`guard.py` uses macOS process-footprint APIs and enforces a 2 GiB available-memory floor and 256 MiB swap-growth ceiling. It is not portable to Linux; use your OS resource controls there. Node/UI tests are lightweight and use no real model.
