#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to an Emscripten SDK checkout with 4.0.23 installed and active}"
: "${EMDAWNWEBGPU_DIR:?Set EMDAWNWEBGPU_DIR to the extracted v20260317.182325 package}"
export PATH="$EMSDK/upstream/emscripten:$PATH"
emcmake cmake -S wllama -B wllama/build-webgpu-single \
  -DCMAKE_BUILD_TYPE=Release -DWLLAMA_THREADS=OFF \
  -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
  -DEMDAWNWEBGPU_DIR="$EMDAWNWEBGPU_DIR" -DLLAMA_BUILD_NUMBER=0
cmake --build wllama/build-webgpu-single --target wllama -j 2
cp wllama/build-webgpu-single/wllama.js wllama/src/wasm/wllama.js
cp wllama/build-webgpu-single/wllama.wasm wllama/src/wasm/wllama.wasm
(
  cd wllama
  npm ci --ignore-scripts
  npm run build:glue
  npm run build:worker
  npm run build:tsup
  npm run build:typedef
  mkdir -p esm/wasm
  cp src/wasm/wllama.wasm esm/wasm/
)
python3 scripts/package-pages.py --refresh-runtime
