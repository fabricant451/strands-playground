import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn('python3',['-m','http.server','8088','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try {
 await new Promise(r=>setTimeout(r,700));
 browser = await chromium.launch({headless:true});
 const page = await browser.newPage();
 await page.setViewportSize({width:1400,height:1100});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}}));
 await page.route('**/wllama/esm/index.js',route=>route.fulfill({contentType:'text/javascript',body:`export class Wllama {
 setCompat(){} async loadModelFromUrl(url,options){this.loaded=true;options.progressCallback({loaded:1,total:1});}
 isModelLoaded(){return this.loaded;} async exit(){this.loaded=false;}
 async createSystemOne(request){window.testRequest=request; const answers={}; for(const [name,q] of Object.entries(request.questions)){
 if(q.type==='noul') answers[name]={type:'noul',noul:.83};
 if(q.type==='choice'){const keys=Object.keys(q.criteria);answers[name]={type:'choice',choice:keys[0],probabilities:Object.fromEntries(keys.map((k,i)=>[k,i===0?.84:.16/(keys.length-1)])),confidence:.76};}
 if(q.type==='score') answers[name]={type:'score',score:1.1,legend:Object.fromEntries(q.criteria.map((v,i)=>[i,v])),probabilities:Object.fromEntries(q.criteria.map((v,i)=>[i,i===1?.6:.4/(q.criteria.length-1)])),confidence:.52};
 } return {answers,usage:{input_tokens:238,output_tokens:0}};}
}` }));
 await page.goto('http://127.0.0.1:8088');
 assert.equal(await page.locator('.question-card').count(),3);
 assert(await page.locator('#run').isDisabled());
 await page.click('#load'); await page.click('#run');
 await page.waitForSelector('.result-card');
 assert.equal(await page.locator('.result-card').count(),3);
 assert.equal(await page.evaluate(()=>window.testRequest.questions.frustration.criteria[1]),'frustrated');
 await page.screenshot({path:'reports/ui-desktop.png',fullPage:true});
 await page.locator('.question-name').nth(1).fill('department');
 assert.match(await page.locator('#result-note').textContent(),/Inputs changed/);
 await page.click('#run'); assert.match(await page.locator('#request-error').textContent(),/unique/);
 await page.locator('.question-name').nth(1).fill('urgent');
 await page.locator('.question-card').first().locator('.add-option').click();
 await page.click('#run'); assert.match(await page.locator('#request-error').textContent(),/Fill in every/);
 await page.locator('.question-card').first().locator('.option-label').last().fill('<b>Other</b>');
 await page.click('#run');
 await page.waitForFunction(()=>!document.getElementById('run').disabled);
 assert.equal(await page.locator('#answers b').count(),0);
 assert((await page.locator('#answers').textContent()).includes('<b>Other</b>'));
 await page.locator('.question-card').first().locator('.remove-option').last().click();
 await page.click('#add-question');
 const added=page.locator('.question-card').last();
 await added.locator('.question-name').fill('quality'); await added.locator('.instructions').fill('How good is it?');
 await added.locator('.question-type').selectOption('score');
 for(let i=0;i<8;i++) await added.locator('.add-option').click();
 assert.equal(await added.locator('.option-label').count(),10); assert(await added.locator('.add-option').isDisabled());
 await added.locator('.remove-question').click();
 await page.locator('.question-card').first().locator('.question-type').selectOption('noul');
 assert.equal(await page.locator('.question-card').first().locator('.option-label').count(),0);
 await page.locator('.question-card').first().locator('.question-type').selectOption('choice');
 assert.equal(await page.locator('.question-card').first().locator('.option-label').first().inputValue(),'billing');
 await page.click('#example'); await page.click('#run');
 await page.waitForFunction(()=>!document.getElementById('run').disabled);
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'reports/ui-mobile.png',fullPage:true});
 await page.click('#unload'); assert(await page.locator('#run').isDisabled());
 assert.deepEqual(errors,[]); console.log('UI passed: editor, validation, types, option limits, rendering, stale results, mobile layout, unload. Inference mocked; no model loaded.');
} finally {await browser?.close(); server.kill();}
