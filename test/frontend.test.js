import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const html=await readFile(resolve(root,'index.html'),'utf8');
const games=await readFile(resolve(root,'games.js'),'utf8');
const app=await readFile(resolve(root,'app.js'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function canvasContext(){
  const noop=()=>{}; return new Proxy({createLinearGradient:()=>({addColorStop:noop}),measureText:()=>({width:0}),canvas:null}, {get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
}
function harness({withApp=false,fetchImpl=async()=>new Response('{}',{status:200})}={}){
  const dom=new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/gi,''),{runScripts:'dangerously',url:'http://localhost/',beforeParse(w){w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.animate=function(){return {cancel(){}};};w.HTMLCanvasElement.prototype.getContext=function(){const x=canvasContext();x.canvas=this;return x;};w.fetch=fetchImpl;w.crypto.randomUUID=()=>`test-${Math.random()}`;}});
  dom.window.eval(games);
  if(withApp)dom.window.eval(app);
  return dom;
}
const click=(w,sel)=>{const e=w.document.querySelector(sel);assert.ok(e,`missing ${sel}`);e.click();return e;};
const by=(w,id)=>w.document.getElementById(id);

 test('all seven adapters snapshot/restore without crashing and reject corrupt snapshots',async t=>{
  for(const id of ['balloons','hex','network','evolution','architect','outbreak','cipher']) await t.test(id,async()=>{
    const d=harness(),w=d.window; const adapter=w.ArcadeGames[id];assert.ok(adapter,`${id} adapter registered`);
    if(id==='balloons'){click(w,'#startGame');}
    let snapshot=await adapter.snapshot();assert.ok(snapshot&&typeof snapshot==='object');
    const serialized=JSON.parse(JSON.stringify(snapshot));
    await adapter.restore(serialized); assert.doesNotThrow(()=>adapter.snapshot());
    // Explicitly assert structured state retains serializable values for collection/typed-array games.
    if(id==='network') assert.ok(Array.isArray(serialized.blocked));
    if(id==='architect') assert.ok(Array.isArray(serialized.tiles));
    if(id==='outbreak'){assert.ok(Array.isArray(serialized.cells));assert.ok(Array.isArray(serialized.energy));}
    const corrupt=structuredClone(serialized);corrupt.version=999;
    assert.throws(()=>adapter.restore(corrupt),/invalid|version|save|checkpoint/i);
    d.window.close();
  });
});

test('Hex local play supports undo and redo',()=>{
 const d=harness(),w=d.window;click(w,'[data-hex-mode="local"]');click(w,'#hexBoard [data-index="60"]');
 assert.equal(by(w,'hexMoveCount').textContent,'1');click(w,'#hexUndo');assert.equal(by(w,'hexMoveCount').textContent,'0');click(w,'#hexRedo');assert.equal(by(w,'hexMoveCount').textContent,'1');d.window.close();
});
test('Network selection/firewall and reset update state',()=>{
 const d=harness(),w=d.window; const node=[...w.document.querySelectorAll('.network-node')].find(x=>!x.disabled&&x.dataset.node!=='2');assert.ok(node);node.click();click(w,'#networkFirewall');assert.ok(Number(by(w,'networkBlockedCount').textContent)<=1);click(w,'#networkReset');assert.equal(by(w,'networkBlockedCount').textContent,'0');d.window.close();
});
test('Evolution starts and pauses cleanly',async()=>{
 const d=harness(),w=d.window;click(w,'#tabEvolution');click(w,'#gaStart');await wait(40);click(w,'#gaStart');assert.match(by(w,'gaStart').textContent,/evolution/i);click(w,'#gaReset');assert.equal(by(w,'gaGeneration').textContent,'0');d.window.close();
});
test('Architect places a tile, advances, and resets',()=>{
 const d=harness(),w=d.window;const cell=[...w.document.querySelectorAll('#archBoard button')].find(x=>!x.disabled);assert.ok(cell);cell.click();assert.ok(Number(by(w,'archResources').textContent)<=16);click(w,'#archAdvance');assert.equal(by(w,'archTurns').textContent,'1');click(w,'#archReset');assert.equal(by(w,'archResources').textContent,'18');assert.equal(by(w,'archTurns').textContent,'0');d.window.close();
});
test('Outbreak supports keyboard seeding and stepping',()=>{
 const d=harness(),w=d.window;const c=by(w,'outbreakCanvas');c.focus();for(let i=0;i<3;i++){c.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));c.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));}assert.equal(by(w,'outbreakSeedCount').textContent,'3');click(w,'#outbreakSeedButton');click(w,'#outbreakStep');assert.equal(by(w,'outbreakGen').textContent,'1');click(w,'#outbreakReset');assert.equal(by(w,'outbreakSeedCount').textContent,'0');d.window.close();
});
test('Cipher accepts guess, computes hint, and resets history',()=>{
 const d=harness(),w=d.window;click(w,'#cipherGuess');assert.equal(by(w,'cipherAttempts').textContent,'1/10');click(w,'#cipherHint');assert.match(by(w,'cipherStatus').textContent,/hint/i);click(w,'#cipherReset');assert.equal(by(w,'cipherAttempts').textContent,'0/10');d.window.close();
});
test('Balloon quick-select/pop works and reset invalidates pending pop timers',async()=>{
 const d=harness(),w=d.window;by(w,'balloonCount').value='8';click(w,'#startGame');click(w,'.quick-btn');click(w,'#popButton');click(w,'#newGameButton');await wait(100);assert.equal(by(w,'setupView').hidden,false);d.window.close();
});

test('Architect accepts slow moss on the runner path and snapshot restores it',async()=>{
 const d=harness(),w=d.window;click(w,'[data-arch-tool="slow"]');const cell=[...w.document.querySelectorAll('#archBoard button')].find(x=>!x.disabled);cell.click();const snap=await w.ArcadeGames.architect.snapshot();assert.doesNotThrow(()=>w.ArcadeGames.architect.restore(JSON.parse(JSON.stringify(snap))));d.window.close();
});

test('Outbreak terminal snapshot restores without starting a timer',async()=>{
 const d=harness(),w=d.window,a=w.ArcadeGames.outbreak,snap=await a.snapshot();snap.active=false;snap.over=true;snap.generation=72;assert.doesNotThrow(()=>a.restore(JSON.parse(JSON.stringify(snap))));assert.equal((await a.snapshot()).generation,72);d.window.close();
});

test('Progress UI does not report success on backend errors',async()=>{
 const d=harness({withApp:true,fetchImpl:async url=>String(url).includes('/api/session')?new Response(JSON.stringify({csrfToken:'x'}),{status:200}):new Response(JSON.stringify({error:{message:'backend down'}}),{status:503})});const w=d.window;await wait(30);by(w,'progressGame').value='hex';click(w,'#saveProgress');await wait(40);assert.match(by(w,'progressStatus').textContent,/backend down/i);assert.doesNotMatch(by(w,'progressStatus').textContent,/progress saved/i);d.window.close();
});
test('Progress save/restore/delete and history pagination use backend responses',async()=>{
 const calls=[];let saves=[],history=Array.from({length:12},(_,i)=>({game:'hex',outcome:'win',createdAt:new Date(Date.now()-i*1000).toISOString(),details:{}}));let token='csrf';
 const fetchImpl=async(url,opt={})=>{url=String(url);calls.push([url,opt.method||'GET']);if(url==='/api/session')return new Response(JSON.stringify({csrfToken:token}),{status:200});if(url.startsWith('/api/history')){const u=new URL(url,'http://localhost');const offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));return new Response(JSON.stringify({results:history.slice(offset,offset+limit),total:history.length}),{status:200});}if(url.startsWith('/api/saves/')){const game=url.split('/').pop();if(opt.method==='PUT'){saves=[{game,updatedAt:new Date().toISOString()}];return new Response('{}',{status:200});}if(opt.method==='DELETE'){saves=[];return new Response('{}',{status:200});}return new Response(JSON.stringify({state:{version:1,board:Array(121).fill(0),player:1,ai:true,over:false,history:[],redo:[],depth:2}}),{status:200});}if(url==='/api/saves')return new Response(JSON.stringify({saves}),{status:200});return new Response('{}',{status:200});};
 const d=harness({withApp:true,fetchImpl}),w=d.window;await wait(50);by(w,'progressGame').value='hex';click(w,'#saveProgress');await wait(50);assert.ok(calls.some(c=>c[0]==='/api/saves/hex'&&c[1]==='PUT'));click(w,'#resumeProgress');await wait(50);assert.match(by(w,'progressStatus').textContent,/restored/i);click(w,'#deleteSave');await wait(50);assert.ok(calls.some(c=>c[0]==='/api/saves/hex'&&c[1]==='DELETE'));click(w,'#historyMore');await wait(40);assert.ok(calls.some(c=>c[0].includes('offset=10')));d.window.close();
});
