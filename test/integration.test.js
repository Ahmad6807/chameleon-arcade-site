import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createApp } from '../server/app.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const games = await readFile(new URL('../games.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settled(w) {
  for (let i=0; i<100 && w.document.getElementById('progressRoot').getAttribute('aria-busy')==='true'; i++) await wait(10);
  assert.notEqual(w.document.getElementById('progressRoot').getAttribute('aria-busy'), 'true', 'client operation completed');
}

test('real frontend saves all seven games, resumes after reload, records results and deletes private data', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'arcade-integration-'));
  const api = createApp({ dbPath:join(dir,'arcade.sqlite'), appOrigin:'http://arcade.test', logger:{error(){}} });
  const server = createServer(api.app);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{ await new Promise(r=>server.close(r)); api.close(); await rm(dir,{recursive:true,force:true}); });
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const actualFetch=async(path, options={})=>{
    const headers={...options.headers,Origin:'http://arcade.test', ...(cookie?{Cookie:cookie}:{})};
    const response=await fetch(base+path,{...options,headers});
    const setCookie=response.headers.get('set-cookie');
    if(setCookie) cookie=setCookie.split(';')[0];
    return response;
  };
  const makeDom=()=>{
    const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/gi,''),{
      runScripts:'dangerously',url:'http://arcade.test/',beforeParse(w){
        w.matchMedia=()=>({matches:true});
        w.HTMLElement.prototype.scrollIntoView=function(){};
        w.HTMLCanvasElement.prototype.getContext=function(){ return new Proxy({createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)}); };
        w.fetch=actualFetch; w.AbortController=globalThis.AbortController; w.CSS={escape:s=>String(s)}; w.crypto.randomUUID=randomUUID;
      }
    });
    dom.window.eval(games); dom.window.eval(client); t.after(()=>dom.window.close()); return dom;
  };
  const d=makeDom(), w=d.window, $=id=>w.document.getElementById(id);
  await w.ArcadeAPI.ready;
  assert.match($('progressStatus').textContent,/Guest session ready/);
  $('startGame').click();
  for(const game of ['balloons','hex','network','evolution','architect','outbreak','cipher']){
    $('progressGame').value=game; $('saveProgress').click(); await settled(w);
    assert.match($('progressStatus').textContent,/progress saved/, `${game} saved through HTTP`);
  }
  const stored=await (await actualFetch('/api/saves')).json();
  assert.equal(stored.saves.length,7);
  const next=makeDom(), nw=next.window;
  await nw.ArcadeAPI.ready;
  for(const game of stored.saves.map(x=>x.game)){
    const select=nw.document.getElementById('progressGame');select.value=game;select.dispatchEvent(new nw.Event('change'));
    nw.document.getElementById('resumeProgress').click(); await settled(nw);
    assert.match(nw.document.getElementById('progressStatus').textContent,/progress restored/,`${game} resumed on new page`);
  }
  nw.dispatchEvent(new nw.CustomEvent('arcade:result',{detail:{game:'hex',outcome:'win',details:{moves:3}}}));
  for(let i=0;i<100;i++){
    const history=await (await actualFetch('/api/history')).json();
    if(history.total===1)break;
    await wait(10);
  }
  assert.equal((await (await actualFetch('/api/history')).json()).total,1);
  nw.document.getElementById('deleteAll').click(); nw.document.getElementById('confirmYes').click(); await settled(nw);
  assert.equal((await (await actualFetch('/api/saves')).json()).saves.length,0);
  assert.equal((await (await actualFetch('/api/history')).json()).total,0);
});
