# Strands decision playground

[Live demo](https://fabricant451.github.io/strands-playground/) · [GGUF model](https://huggingface.co/fabricant451/strands-decider-2B-hobson-v19-GGUF)

A browser playground for Strands Decider Hobson v19: build choice, yes/no, and scale questions, then inspect the answer probabilities. Inference uses a custom llama.cpp/wllama runtime with WebGPU and one CPU thread. No WASM pthreads, shared memory, isolation headers, or service worker are required.

## Try a clone

Python 3 is sufficient to serve the shipped application; no compiler or model conversion is needed.

```sh
git clone https://github.com/fabricant451/strands-playground.git
cd strands-playground
python3 scripts/package-pages.py
python3 scripts/serve.py --directory site
```

Open http://127.0.0.1:8080 in a current Chrome browser with WebGPU, shader-f16, WASM memory64, and JSPI support. Click **Load model** to download the 1.9 GiB GGUF from Hugging Face; subsequent loads use browser storage. **Unload** releases the worker.

## Edit and deploy

Edit `index.html`, `style.css`, `editor.js`, and `demo.js` at the repository root. Package and preview with the commands above. Every push to `main` packages these sources and deploys `site/` to GitHub Pages automatically:

```sh
git add index.html style.css editor.js demo.js
git commit -m "Update playground"
git push
```

Do not edit generated files in `site/` directly. The compiled runtime in `site/wllama/esm/` is retained in Git so UI changes do not require an Emscripten build. To ship a newly built runtime, run `python3 scripts/package-pages.py --refresh-runtime` and commit the updated runtime files.

## What's tracked

| Path | Purpose |
| --- | --- |
| Root HTML/CSS/JS | Editable UI sources |
| `scripts/` | Packaging, upstream setup, WASM build, conversion prerequisites, model upload, tests and memory guard |
| `patches/` | Complete local llama.cpp and wllama source changes |
| `manifest.json` | Pinned upstream and model revisions |
| `fixtures/` | Requests, Python reference outputs, exact tokens, marker positions and head values |
| `requirements.lock.txt` | Recorded Python environment; editable dependencies use the prepared local checkouts |
| `site/` | Published assets, compiled runtime and license notices |
| `deployment/` | Model card, pinned upload metadata and deployment instructions |
| `docs/BUILD.md` | Native, GGUF and single-thread WebGPU build instructions |
| `PLAN.md` | Original research plan, including work beyond the completed smoke tests |

Upstream trees are separate, ignored checkouts, recreated by `python3 scripts/setup-sources.py`. This avoids vendoring their histories while preserving every local source change as a patch. Model weights, virtual environments, build directories, credentials, browser profiles and raw run reports are excluded. The previous standalone `deployment/strands-playground/` checkout remains local and is no longer used for deployment.

## Test the UI without loading a model

Node.js 22 and npm are used for browser tests:

```sh
npm ci
npx playwright install chromium
npm run test:ui
```

This tests the editor, validation, response display and mobile layout with a mocked runtime. It does not download or run the model. GitHub Actions also runs this test on pushes and pull requests.

## Test real inference

See [build and validation instructions](docs/BUILD.md). Full browser tests download/load the GGUF and require real WebGPU hardware. Measured successful browser runs used about 5.3–5.6 GiB of process memory on the development Mac. Eight smoke-test fixtures matched the Python reference within 0.006 probability error; this is not a broad quality benchmark.

The numeric-key fixture preserves Python option order using a Proxy. JavaScript normally reorders integer-like object keys, changing the prompt and probabilities. Use named option keys for ordinary requests.

See [deployment details](deployment/DEPLOY.md) for model updates and authentication. Tokens are never included in the browser application.
