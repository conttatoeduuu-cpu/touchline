import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';
if(!new URL(base).hostname.match(/^(localhost|127\.0\.0\.1)$/))throw new Error('Use apenas a base local para os testes com dados temporários.');
const keys=JSON.parse(readFileSync(new URL('../.local-access.json',import.meta.url),'utf8'));
async function call(team,action,data,cookie,origin=base){const r=await fetch(`${base}/api/${team}/${action}`,{method:data?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json',Origin:origin}:{})},...(data?{body:JSON.stringify(data)}:{})});let result;try{result=await r.json()}catch{result={}}return {status:r.status,body:result,cookie:r.headers.get('set-cookie')?.split(';')[0]}}
async function access(team){const r=await fetch(`${base}/access/${team}/${keys[team.toUpperCase()+'_LINK']}`,{redirect:'manual'});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0]}
let count=0;function check(actual,expected,label){assert.equal(actual,expected,label);console.log('PASS '+label);count++}
check((await call('dtr','data')).status,401,'anonymous data denied');
check((await call('vortex','export')).status,401,'anonymous export denied');
const dtrViewer=await access('dtr');const vortexViewer=await access('vortex');
check((await call('dtr','data',undefined,dtrViewer)).status,200,'DTR viewer reads own team');
check((await call('vortex','data',undefined,dtrViewer)).status,401,'DTR cookie cannot read Vortex');
check((await call('dtr','data',undefined,vortexViewer)).status,401,'Vortex cookie cannot read DTR');
check((await call('dtr','record',{kind:'note',data:{name:'blocked'}},dtrViewer)).status,403,'viewer cannot write');
check((await call('dtr','sync',{},dtrViewer)).status,403,'viewer cannot trigger external synchronization');
check((await call('dtr','login',{password:keys.DTR_ADMIN},undefined,'https://untrusted.test')).status,403,'cross-origin login denied');
const dtrAdmin=await call('dtr','login',{password:keys.DTR_ADMIN});check(dtrAdmin.status,200,'correct administrative password');
const vortexAdmin=await call('vortex','login',{password:keys.VORTEX_ADMIN});check(vortexAdmin.status,200,'separate Vortex administrative password');
check((await call('vortex','record',{kind:'note',data:{name:'blocked'}},dtrAdmin.cookie)).status,401,'DTR admin cannot write Vortex');
const id='test-isolation-'+crypto.randomUUID();
try{
 check((await call('dtr','record',{id,kind:'note',data:{name:'DTR sentinel'}},dtrAdmin.cookie)).status,200,'DTR creates persistent record');
 check((await call('dtr','record',{id,kind:'event',data:{name:'wrong kind',date:new Date().toISOString()}},dtrAdmin.cookie)).status,409,'record ID cannot silently change category');
 check((await call('vortex','record',{id,kind:'note',data:{name:'Vortex sentinel'}},vortexAdmin.cookie)).status,200,'same record ID isolated across teams');
 const a=(await call('dtr','data',undefined,dtrViewer)).body;const b=(await call('vortex','data',undefined,vortexViewer)).body;
 check(a.records.find(r=>r.id===id).data.name,'DTR sentinel','DTR record remains independent');
 check(b.records.find(r=>r.id===id).data.name,'Vortex sentinel','Vortex record remains independent');
 check(JSON.stringify(a).includes(keys.DTR_ADMIN),false,'administrative password absent from data response');
 check((await call('dtr','match',{match:{opponent:'invalid',playedAt:'not-a-date',goalsFor:0,goalsAgainst:0}},dtrAdmin.cookie)).status,400,'invalid match rejected');
 check((await call('dtr','record',{kind:'video',data:{name:'bad URL',url:'javascript:alert(1)'}},dtrAdmin.cookie)).status,400,'unsafe content URL rejected');
}finally{
 await call('dtr','delete',{id},dtrAdmin.cookie);await call('vortex','delete',{id},vortexAdmin.cookie);
}
check((await call('dtr','logout',{},dtrAdmin.cookie)).status,200,'administrative logout succeeds');
check((await call('dtr','data',undefined,dtrAdmin.cookie)).status,401,'old administrative session revoked after logout');
console.log(`${count} security checks passed.`);
