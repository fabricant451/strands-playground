import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
const server = process.env.BROWSER_URL ? null : spawn('python3', ['scripts/serve.py'], {stdio:'ignore'});
let browser;
const deadline = setTimeout(()=>{console.error('Browser test deadline exceeded'); process.exit(1);}, 240000);
try {
  await new Promise(r=>setTimeout(r,1000));
  browser = await chromium.launchPersistentContext('reports/browser-profile', {headless:false, args:['--enable-unsafe-webgpu']});
  const page = await browser.newPage();
  let offloaded = false;
  let singleThread = false;
  page.on('console', msg=>{ console.log(msg.type(),msg.text()); if(msg.text().includes('offloaded 25/25 layers to GPU')) offloaded = true; if(msg.text().includes('Multithread enabled: false, pthreadPoolSize: 0')) singleThread = true; });
  page.on('pageerror', err=>console.log('PAGE ERROR',err.stack));
  await page.goto(process.env.BROWSER_URL || 'http://127.0.0.1:8080');
  console.log('CAPABILITIES', await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter(); return {gpu:!!a, features:a?[...a.features]:[], isolated:crossOriginIsolated};}));
  assert.equal(await page.evaluate(()=>crossOriginIsolated), false);
  assert.equal(await page.evaluate(()=>typeof SharedArrayBuffer), 'undefined');
  await page.click('#load');
  for(let i=0;i<180;i++) {
    await page.waitForTimeout(1000);
    if(i%10===0) console.log('STATUS',await page.locator('#status').textContent());
    if(await page.evaluate(()=>window.strands.loaded)) break;
    if(await page.locator('#load').isEnabled()) throw Error(await page.locator('#status').textContent());
  }
  if(!await page.evaluate(()=>window.strands.loaded)) throw Error('Model load timed out');
  await page.click('#run');
  await page.waitForFunction(()=>!document.getElementById('run').disabled,{},{timeout:120000});
  console.log('RESULT',await page.locator('#raw').textContent());
  console.log('FINAL',await page.locator('#status').textContent());
  if(!await page.locator('#raw').textContent()) throw Error('No inference result');
  assert(offloaded, 'Expected full WebGPU offload');
  assert(singleThread, 'Expected no WASM pthread pool');
  assert.equal(Object.keys(JSON.parse(await page.locator('#raw').textContent()).answers).length, 3);
  const results = [];
  // Preserve numeric option key order from the Python reference.
  const requests = JSON.parse(execFileSync('python3', ['-c', "import json; print(json.dumps([{k:list(q.get('criteria',{})) for k,q in f['request']['questions'].items() if q['type']=='choice'} for f in json.load(open('fixtures/reference.json'))]))"], {encoding:'utf8'}));
  for (const [index, fixture] of JSON.parse(readFileSync('fixtures/reference.json', 'utf8')).entries()) {
    const actual = await page.evaluate(({request, orders})=>{
      for (const [name, keys] of Object.entries(orders)) {
        request.questions[name].criteria = new Proxy(request.questions[name].criteria, {ownKeys:()=>keys});
      }
      return window.strands.decide(request);
    }, {request:fixture.request, orders:requests[index]});
    assert.equal(actual.usage.input_tokens, fixture.response.usage.input_tokens);
    let maxError = 0;
    for (const [name, expected] of Object.entries(fixture.response.answers)) {
      const answer = actual.answers[name];
      if (expected.choice !== undefined) assert.equal(answer.choice, expected.choice);
      for (const [key, value] of Object.entries(expected.probabilities ?? {}))
        maxError = Math.max(maxError, Math.abs(answer.probabilities[key] - value));
      if (expected.noul !== undefined) maxError = Math.max(maxError, Math.abs(answer.noul - expected.noul));
    }
    console.log('FIXTURE', JSON.stringify({request:fixture.request, actual, expected:fixture.response, maxError}));
    assert(maxError < 0.03, `Probability error ${maxError} exceeds tolerance`);
    results.push({request:fixture.request, actual, maxError});
  }
  writeFileSync('reports/browser-parity.json', JSON.stringify(results, null, 2));
  console.log('PARITY', results.length, 'fixtures passed; max error', Math.max(...results.map(r=>r.maxError)));
  await page.evaluate(()=>document.getElementById('raw').textContent = '');
  await page.click('#run');
  await page.waitForFunction(()=>!document.getElementById('run').disabled, {}, {timeout:60000});
  assert.equal(Object.keys(JSON.parse(await page.locator('#raw').textContent()).answers).length, 3);
  await page.click('#unload');
  await page.waitForFunction(()=>document.getElementById('status').textContent === 'Model unloaded.');
  assert.equal(await page.evaluate(()=>window.strands.loaded), false);
} finally { server?.kill(); await browser?.close(); clearTimeout(deadline); }
