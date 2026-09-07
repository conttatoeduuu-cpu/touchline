import {readFileSync,existsSync,mkdirSync,appendFileSync,statSync,writeFileSync} from 'node:fs';
const project=new URL('../',import.meta.url);
const keys=JSON.parse(readFileSync(new URL('.local-access.json',project),'utf8'));
const {origin}=JSON.parse(readFileSync(new URL('collector.config.json',project),'utf8'));
const logs=new URL('.wrangler/logs/',project);mkdirSync(logs,{recursive:true});const log=new URL('collector.log',logs);
function report(result){if(existsSync(log)&&statSync(log).size>2000000)writeFileSync(log,'');appendFileSync(log,JSON.stringify({at:new Date().toISOString(),...result})+'\n')}
try{const response=await fetch(`${origin}/api/jobs`,{method:'POST',headers:{Authorization:`Bearer ${keys.COLLECTOR_KEY}`},signal:AbortSignal.timeout(210000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const body=await response.json();report({ok:true,results:body.results});if(body.results?.every(r=>(r.error&&!r.error.startsWith('Coleta recente ou em andamento'))||r.status==='error'))process.exitCode=1}catch(e){report({ok:false,error:e.message});process.exitCode=1}
