import { Wllama } from './wllama/esm/index.js';

import { getRequest } from './editor.js';

const $ = (id) => document.getElementById(id);
let runtime;
let controller;
let generation = 0;
function status(text) { $('status').textContent = text; }
let busy = false;
let lastRequest;
function controls(isBusy, loaded = false) {
  busy = isBusy;
  $('load').disabled = isBusy || loaded;
  $('load').hidden = loaded;
  $('run').disabled = isBusy || !loaded;
  $('unload').hidden = isBusy || !loaded;
  $('stop').hidden = !isBusy;
  $('model-dot').className = `dot ${isBusy ? 'busy' : loaded ? 'ready' : ''}`;
  $('run-hint').textContent = isBusy ? 'Working...' : loaded ? 'Ready when you are.' : 'Load the model to begin.';
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
        if (current !== generation) return;
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
  } finally { if (current === generation) $('progress').hidden = true; }
}

function element(tag, className, text) {
  const el = document.createElement(tag); el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function render(response, request, elapsed) {
  $('raw').textContent = JSON.stringify(response, null, 2);
  $('raw-details').hidden = false;
  $('empty-results').hidden = true;
  $('answers').replaceChildren();
  $('result-meta').textContent = `${(elapsed / 1000).toFixed(1)} s · ${response.usage.input_tokens} tokens`;
  for (const [name, answer] of Object.entries(response.answers)) {
    const article = element('article', 'result-card');
    const kind = answer.type === 'noul' ? 'Yes / No' : answer.type === 'score' ? 'Scale' : 'Choice';
    const kicker = element('div','result-kicker');
    kicker.append(element('span','',name), element('span','',kind)); article.append(kicker);
    article.append(element('p','result-prompt',request.questions[name]?.instructions || name));
    const verdict = answer.type === 'noul' ? (answer.noul >= .5 ? 'Yes' : 'No') : answer.type === 'score' ? answer.score.toFixed(2) : answer.choice;
    const value = element('p','result-value',verdict);
    if (answer.type === 'score') value.append(element('small','',`/ ${Object.keys(answer.legend).length-1}`));
    article.append(value);
    const distribution = answer.probabilities ?? {false:1-answer.noul, true:answer.noul};
    const winner = Object.keys(distribution).reduce((a,b)=>distribution[a] >= distribution[b] ? a : b);
    for (const [key, probability] of Object.entries(distribution)) {
      const row = element('div', `probability ${key === winner ? 'winner' : ''}`);
      const labels = element('div','probability-label');
      const label = answer.legend?.[key] ?? (answer.type === 'noul' ? key === 'true' ? 'Yes' : 'No' : key);
      labels.append(element('span','',label),element('span','',`${(100*probability).toFixed(1)}%`));
      const track = element('div','bar-track'); const bar = element('div','bar-fill');
      bar.style.width = `${Math.max(0,Math.min(100,probability*100))}%`; track.append(bar); track.setAttribute('aria-hidden','true');
      row.append(labels,track); article.append(row);
    }
    if (answer.confidence !== undefined) {
      const confidence = element('p','confidence',`Model confidence ${(100*answer.confidence).toFixed(0)}%`);
      confidence.title = 'The model’s confidence measure, not a guarantee of correctness.'; article.append(confidence);
    }
    $('answers').append(article);
  }
}
function updateResultNote() {
  if (!lastRequest) return;
  let stale = true;
  try { stale = JSON.stringify(getRequest()) !== lastRequest; } catch {}
  $('result-note').textContent = stale ? 'Inputs changed. Run again to update these results.' : '';
}
document.addEventListener('requestchange', updateResultNote);

async function decide(request) {
  if (!runtime?.isModelLoaded()) throw new Error('Load the model first.');
  return runtime.createSystemOne(request);
}

$('load').onclick = load;
$('run').onclick = async () => {
  if (busy) return;
  let request;
  try { request = getRequest(); }
  catch (error) { $('request-error').textContent = error.message; $('request-error').hidden = false; return; }
  const current = generation;
  controls(true, true);
  $('request-error').hidden = true;
  $('result-note').textContent = 'Making decisions...';
  try {
    status('Deciding...');
    const start = performance.now();
    const response = await decide(request);
    if (current !== generation) return;
    const elapsed = performance.now()-start;
    render(response, request, elapsed);
    lastRequest = JSON.stringify(request); updateResultNote();
    status(`${response.usage.input_tokens} input tokens, ${elapsed.toFixed(0)} ms.`);
  } catch (error) {
    if (current === generation) { status(error.message); $('result-note').textContent = 'Could not complete this request. Your previous results are unchanged.'; }
  } finally { if (current === generation) controls(false, !!runtime?.isModelLoaded()); }
};
async function unload() {
  ++generation;
  controller?.abort();
  const old = runtime; runtime = undefined;
  await old?.exit().catch(() => {});
  updateResultNote();
  if (!lastRequest) $('result-note').textContent = '';
  controls(false); $('progress').hidden = true; status('Model unloaded.');
}
$('stop').onclick = unload;
$('unload').onclick = unload;
window.strands = { load, decide, unload, get loaded() { return !!runtime?.isModelLoaded(); } };
