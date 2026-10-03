import { Wllama } from './wllama/esm/index.js';

const $ = (id) => document.getElementById(id);
let runtime;
let controller;
let generation = 0;
function status(text) { $('status').textContent = text; }
function controls(busy, loaded = false) {
  $('load').disabled = busy || loaded;
  $('run').disabled = busy || !loaded;
  $('unload').disabled = busy || !loaded;
  $('stop').disabled = !busy;
}

async function load() {
  const current = ++generation;
  controls(true);
  controller = new AbortController();
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter?.features.has('shader-f16')) throw new Error('This demo requires a WebGPU adapter with shader-f16 support. Try a current Chrome browser.');
    runtime = new Wllama({ default: new URL('./wllama/esm/wasm/wllama.wasm', import.meta.url).href });
    runtime.setCompat(null);
    $('progress').hidden = false;
    status('Downloading or reading cached model...');
    const start = performance.now();
    await runtime.loadModelFromUrl("https://huggingface.co/fabricant451/strands-decider-2B-hobson-v19-GGUF/resolve/d0cbec75880e74019c5bc5b80456a9d83e05c18a/strands-q8_0.gguf", {
      n_ctx: 4096, n_batch: 512, n_ubatch: 512, n_threads: 1, n_parallel: 1,
      n_gpu_layers: 99, signal: controller.signal,
      progressCallback: ({ loaded, total }) => {
        $('progress').value = total ? loaded / total : 0;
        status(loaded === total ? 'Preparing model and WebGPU pipelines...' : `Loading model: ${Math.round(loaded / 1048576)} / ${Math.round(total / 1048576)} MiB`);
      },
    });
    if (current !== generation) return;
    status(`Model ready in ${((performance.now() - start) / 1000).toFixed(1)} s.`);
    controls(false, true);
  } catch (error) {
    if (current !== generation) return;
    status(error.message);
    await runtime?.exit().catch(() => {});
    runtime = undefined;
    controls(false);
  } finally { $('progress').hidden = true; }
}

function render(response) {
  $('raw').textContent = JSON.stringify(response, null, 2);
  $('answers').replaceChildren();
  for (const [name, answer] of Object.entries(response.answers)) {
    const article = document.createElement('article');
    const title = document.createElement('strong');
    title.textContent = `${name}: ${answer.choice ?? (answer.score?.toFixed(2)) ?? (answer.noul >= .5 ? 'true' : 'false')}`;
    article.append(title);
    const distribution = answer.probabilities ?? { false: 1 - answer.noul, true: answer.noul };
    for (const [key, probability] of Object.entries(distribution)) {
      const row = document.createElement('div'); row.className = 'option';
      const label = document.createElement('span'); label.textContent = answer.legend?.[key] ?? key;
      const bar = document.createElement('progress'); bar.max = 1; bar.value = probability;
      const value = document.createElement('span'); value.textContent = `${(100 * probability).toFixed(1)}%`;
      row.append(label, bar, value); article.append(row);
    }
    if (answer.confidence !== undefined) {
      const confidence = document.createElement('small');
      confidence.textContent = `Confidence: ${answer.confidence.toFixed(3)}`; article.append(confidence);
    }
    $('answers').append(article);
  }
}

async function decide(request) {
  if (!runtime?.isModelLoaded()) throw new Error('Load the model first.');
  return runtime.createSystemOne(request);
}

$('load').onclick = load;
$('run').onclick = async () => {
  const current = generation;
  controls(true, true);
  try {
    const request = { state: $('state').value, questions: JSON.parse($('questions').value) };
    status('Deciding...');
    const start = performance.now();
    const response = await decide(request);
    if (current !== generation) return;
    render(response);
    status(`${response.usage.input_tokens} input tokens, ${(performance.now()-start).toFixed(0)} ms.`);
  } catch (error) { if (current === generation) status(error.message); }
  finally { if (current === generation) controls(false, !!runtime?.isModelLoaded()); }
};
async function unload() {
  ++generation;
  controller?.abort();
  const old = runtime; runtime = undefined;
  await old?.exit().catch(() => {});
  controls(false); $('progress').hidden = true; status('Model unloaded.');
}
$('stop').onclick = unload;
$('unload').onclick = unload;
window.strands = { load, decide, unload, get loaded() { return !!runtime?.isModelLoaded(); } };
