import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createApp} from '../server/app.js';
const origin='http://localhost:3000';
async function fixture(t, options={}) {
  const tmp=options.dbPath?null:await mkdtemp(join(tmpdir(),'arcade-'));
  const instance=createApp({dbPath:options.dbPath||join(tmp,'db.sqlite'),appOrigin:origin,production:false,logger:{error(){}},...options});
  const server=createServer(instance.app);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let closed=false;
  const close=async()=>{
    if(closed)return;closed=true;
    const closing=new Promise(r=>server.close(r));server.closeAllConnections();await closing;
    instance.close();if(tmp)await rm(tmp,{recursive:true,force:true});
  };
  t.after(close);
  return {...instance,base:`http://127.0.0.1:${server.address().port}`,close};
}
async function session(base,cookie){
  const r=await fetch(base+'/api/session',{headers:cookie?{cookie}:{}});
  return {body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie,headers:r.headers};
}
async function call(base,path,{guest,method='GET',body,csrf=guest?.body.csrfToken,requestOrigin=origin,contentType='application/json'}={}){
  const headers={};if(guest)headers.cookie=guest.cookie;
  if(method!=='GET'){headers.origin=requestOrigin;headers['content-type']=contentType;if(csrf)headers['x-csrf-token']=csrf;}
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),headers:r.headers};
}

test('guest sessions have protected cookies, cached data is forbidden, and preferences persist',async t=>{
 const f=await fixture(t),g=await session(f.base);
 assert.deepEqual(g.body.preferences,{mute:false});assert.ok(g.body.csrfToken);
 assert.match(g.headers.get('set-cookie'),/HttpOnly/);assert.match(g.headers.get('set-cookie'),/SameSite=Strict/);
 const out=await call(f.base,'/api/preferences',{guest:g,method:'PATCH',body:{mute:true}});
 assert.equal(out.status,200);assert.deepEqual(out.body,{preferences:{mute:true}});
 assert.equal((await session(f.base,g.cookie)).body.preferences.mute,true);
 assert.equal((await call(f.base,'/api/saves',{guest:g})).headers.get('cache-control'),'no-store');
});
test('mutations reject absent/wrong CSRF, cross-origin requests, and unauthenticated readers',async t=>{
 const f=await fixture(t),g=await session(f.base);
 for(const csrf of ['', 'wrong'])assert.equal((await call(f.base,'/api/preferences',{guest:g,csrf,method:'PATCH',body:{mute:false}})).status,403);
 assert.equal((await call(f.base,'/api/preferences',{guest:g,requestOrigin:'https://evil.test',method:'PATCH',body:{mute:false}})).status,403);
 assert.equal((await call(f.base,'/api/saves')).status,401);
});
test('save CRUD and history idempotency are scoped to each guest',async t=>{
 const f=await fixture(t),a=await session(f.base),b=await session(f.base);
 assert.equal((await call(f.base,'/api/saves/hex',{guest:a,method:'PUT',body:{state:{version:1,level:2}}})).status,200);
 assert.deepEqual((await call(f.base,'/api/saves/hex',{guest:a})).body.state,{version:1,level:2});
 assert.equal((await call(f.base,'/api/saves/hex',{guest:b})).status,404);
 assert.equal((await call(f.base,'/api/saves',{guest:b})).body.saves.length,0);
 const record={id:'123e4567-e89b-42d3-a456-426614174000',game:'hex',outcome:'win',details:{moves:4}};
 assert.equal((await call(f.base,'/api/history',{guest:a,method:'POST',body:record})).status,200);
 await call(f.base,'/api/history',{guest:a,method:'POST',body:{...record,details:{moves:99}}});
 const h=(await call(f.base,'/api/history',{guest:a})).body;assert.equal(h.total,1);assert.equal(h.results[0].details.moves,4);
 assert.equal((await call(f.base,'/api/history',{guest:b})).body.total,0);
 assert.equal((await call(f.base,'/api/saves/hex',{guest:a,method:'DELETE'})).status,200);
 assert.equal((await call(f.base,'/api/saves/hex',{guest:a})).status,404);
});
test('delete all cascades, invalidates the old session, and leaves another guest untouched',async t=>{
 const f=await fixture(t),a=await session(f.base),b=await session(f.base);
 for(const g of [a,b])await call(f.base,'/api/saves/hex',{guest:g,method:'PUT',body:{state:{version:1}}});
 assert.deepEqual((await call(f.base,'/api/data',{guest:a,method:'DELETE',body:{}})).body,{ok:true});
 assert.equal((await call(f.base,'/api/saves',{guest:a})).status,401);
 assert.equal((await call(f.base,'/api/saves',{guest:b})).body.saves.length,1);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM guests').get().n,1);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM saves').get().n,1);
});
test('SQLite data survives closing and reopening the app with the same database',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'arcade-persist-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const dbPath=join(dir,'db.sqlite'),first=await fixture(t,{dbPath}),g=await session(first.base);
 await call(first.base,'/api/saves/cipher',{guest:g,method:'PUT',body:{state:{version:1,board:[1,2]}}});
 await first.close();const second=await fixture(t,{dbPath});
 assert.deepEqual((await call(second.base,'/api/saves/cipher',{guest:g})).body.state,{version:1,board:[1,2]});
});
test('invalid JSON, invalid payloads, missing games and oversized requests return safe errors',async t=>{
 const f=await fixture(t),g=await session(f.base);
 assert.equal((await call(f.base,'/api/saves/nope',{guest:g,method:'PUT',body:{state:{}}})).status,400);
 assert.equal((await call(f.base,'/api/saves/hex',{guest:g,method:'PUT',body:{state:[]}})).status,400);
 assert.equal((await call(f.base,'/api/history?limit=bad',{guest:g})).status,400);
 assert.equal((await call(f.base,'/api/preferences',{guest:g,method:'PATCH',body:{mute:'yes'}})).status,400);
 assert.equal((await call(f.base,'/api/saves/hex',{guest:g,method:'PUT',body:{state:{x:'x'.repeat(140000)}}})).status,413);
 const r=await fetch(f.base+'/api/preferences',{method:'PATCH',headers:{cookie:g.cookie,origin,'content-type':'application/json'},body:'{'});
 assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_JSON');
 assert.equal((await call(f.base,'/api/preferences',{guest:g,method:'PATCH',contentType:'text/plain',body:{mute:true}})).status,415);
});
test('static allowlist denies private files, source, traversal and database downloads',async t=>{
 const f=await fixture(t);
 for(const path of ['/.private-claim.txt','/private-claim.url','/server/app.js','/data/arcade.sqlite','/.env','/package.json','/README.md','/%2e%2e/.env'])assert.equal((await fetch(f.base+path)).status,404,path);
 assert.equal((await fetch(f.base+'/')).status,200);assert.equal((await fetch(f.base+'/app.js')).status,200);
 assert.deepEqual((await call(f.base,'/api/health')).body,{ok:true});
});
test('session creation is rate limited and expired guest cookies are rejected',async t=>{
 const f=await fixture(t,{sessionLimit:2}),g=await session(f.base);
 f.db.prepare('UPDATE guests SET expires_at=?').run('2000-01-01T00:00:00.000Z');
 assert.equal((await call(f.base,'/api/saves',{guest:g})).status,401);
 await session(f.base);assert.equal((await fetch(f.base+'/api/session')).status,429);
});
