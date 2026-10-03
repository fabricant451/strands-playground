# Strands decision playground

Browser inference using a custom wllama/llama.cpp build with WebGPU and no WASM pthreads.
The GGUF is downloaded from Hugging Face. No backend or credentials are used by the demo.

Enable Settings > Pages > Source > GitHub Actions. The workflow publishes `site/`.
Requires a current Chrome browser with WebGPU, shader-f16, WASM memory64 and JSPI.

The custom runtime includes Strands decision-head support and a deferred-request queue fix.
Source revisions are recorded in `site/manifest.json`; local source changes are in `patches/`. Upstream licenses accompany the bundle. The runtime is built with `WLLAMA_THREADS=OFF`, `GGML_WEBGPU=ON`, and `GGML_WEBGPU_JSPI=ON`.
