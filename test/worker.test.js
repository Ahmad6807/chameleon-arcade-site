import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

function d1(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE guests(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,csrf_token TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,mute INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE saves(guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,game TEXT NOT NULL,state TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(guest_id,game));
 CREATE TABLE history(guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,id TEXT NOT NULL,game TEXT NOT NULL,outcome TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(guest_id,id));`);
 return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},first(){return db.prepare(sql).get(...args)||null;},all(){return {results:db.prepare(sql).all(...args)};},run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};}};
}
const assets={fetch:async()=>new Response('index asset')};
async function req(env,path,{method='GET',cookie,body,raw,csrf,origin='https://arcade.test',headers={},urlOrigin='https://arcade.test'}={}){const h=new Headers(headers);if(cookie)h.set('cookie',cookie);if(body!==undefined||raw!==undefined){if(!h.has('content-type'))h.set('content-type','application/json');h.set('origin',origin);if(csrf)h.set('x-csrf-token',csrf);}return worker.fetch(new Request(urlOrigin+path,{method,headers:h,body:raw??(body===undefined?undefined:JSON.stringify(body))}),env);}
async function session(env){const r=await req(env,'/api/session');const cookie=r.headers.get('set-cookie');return {response:r,cookie:cookie.split(';')[0],csrf:(await r.json()).csrfToken};}
function setup(DB=d1()){return {DB,APP_ORIGIN:'https://arcade.test',ASSETS:assets};}
test('session cookie is secure, HttpOnly, strict and session API is no-store',async()=>{
 const {response,cookie,csrf}=await session(setup());assert.equal(response.status,200);assert.ok(csrf);const header=response.headers.get('set-cookie');assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Secure/);assert.match(header,/Path=\//);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(cookie.split('=')[0],'arcade_session');
});
test('all seven game saves round-trip and remain isolated between sessions',async()=>{
 const env=setup(),a=await session(env),b=await session(env),games=['balloons','hex','network','evolution','architect','outbreak','cipher'];
 for(const [i,game] of games.entries()){const state={level:i+1,progress:[i,'state']};const put=await req(env,`/api/saves/${game}`,{method:'PUT',cookie:a.cookie,csrf:a.csrf,body:{state}});assert.equal(put.status,200,game);const got=await req(env,`/api/saves/${game}`,{cookie:a.cookie});assert.deepEqual((await got.json()).state,state,game);const other=await req(env,`/api/saves/${game}`,{cookie:b.cookie});assert.equal(other.status,404,game);}
});
test('preferences mutations reject missing CSRF and hostile origin',async()=>{
 const env=setup(),s=await session(env);for(const opts of [{csrf:'wrong'},{csrf:s.csrf,origin:'https://evil.test'}]){const r=await req(env,'/api/preferences',{method:'PATCH',cookie:s.cookie,body:{mute:true},...opts});assert.equal(r.status,403);assert.equal((await r.json()).error.code,opts.origin?'ORIGIN_FORBIDDEN':'CSRF_INVALID');}
});
test('history insertion is idempotent and pagination is bounded and ordered',async()=>{
 const env=setup(),s=await session(env),ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
 for(const [i,id] of ids.entries()){const payload={id,game:'hex',outcome:'win',details:{score:i}};assert.equal((await req(env,'/api/history',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:payload})).status,200);}
 const duplicate=await req(env,'/api/history',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{id:ids[0],game:'hex',outcome:'loss',details:{score:99}}});assert.equal((await duplicate.json()).result.outcome,'win');
 const page=await req(env,'/api/history?limit=2&offset=0',{cookie:s.cookie}),data=await page.json();assert.equal(data.total,3);assert.equal(data.results.length,2);const next=await (await req(env,'/api/history?limit=2&offset=2',{cookie:s.cookie})).json();assert.equal(next.results.length,1);assert.equal(next.results[0].id,ids[0]);assert.equal((await req(env,'/api/history?limit=0',{cookie:s.cookie})).status,400);
});
test('invalid JSON and both declared and streamed oversized request bodies are rejected',async()=>{
 const env=setup(),s=await session(env),base={method:'PATCH',cookie:s.cookie,csrf:s.csrf};
 let r=await req(env,'/api/preferences',{...base,raw:'{bad'});assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_JSON');
 r=await req(env,'/api/preferences',{...base,raw:' '.repeat(128*1024+1),headers:{'content-length':String(128*1024+1)}});assert.equal(r.status,413);assert.equal((await r.json()).error.code,'PAYLOAD_TOO_LARGE');
 r=await req(env,'/api/preferences',{...base,raw:JSON.stringify({mute:true}),headers:{'content-length':'1'}});assert.equal(r.status,200);
});
test('D1 persistence survives a new wrapper environment and deleting data cascades',async()=>{
 const db=d1(),env=setup(db),s=await session(env);await req(env,'/api/saves/hex',{method:'PUT',cookie:s.cookie,csrf:s.csrf,body:{state:{level:9}}});await req(env,'/api/history',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{id:'00000000-0000-4000-8000-000000000011',game:'hex',outcome:'win',details:{}}});
 const restarted=setup(db),persisted=await req(restarted,'/api/saves/hex',{cookie:s.cookie});assert.deepEqual((await persisted.json()).state,{level:9});assert.equal((await (await req(restarted,'/api/history',{cookie:s.cookie})).json()).total,1);
 const deleted=await req(restarted,'/api/data',{method:'DELETE',cookie:s.cookie,csrf:s.csrf,body:{}});assert.equal(deleted.status,200);assert.match(deleted.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await req(restarted,'/api/saves/hex',{cookie:s.cookie})).status,401);
 const fresh=await session(restarted);assert.equal((await (await req(restarted,'/api/saves',{cookie:fresh.cookie})).json()).saves.length,0);assert.equal((await (await req(restarted,'/api/history',{cookie:fresh.cookie})).json()).total,0);
});
test('non-API requests pass through to bound assets with security headers',async()=>{const r=await req(setup(),'/anything');assert.equal(await r.text(),'index asset');assert.equal(r.headers.get('x-frame-options'),'DENY');});
