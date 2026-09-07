import {AppError,config,db,secret} from './server';
import {parseEA,type TeamId} from './domain';

const EA_RESPONSE_LIMIT=8_000_000;
const DEFAULT_BACKOFF_MS=2*60_000;   // 2 min (era 5 — reduzido pra não travar)
const MAX_BACKOFF_MS=30*60_000;      // 30 min max (era 60 — mesma razão)

class EAError extends AppError{
 constructor(message:string,public upstreamStatus?:number,public retryAfterMs?:number){super(message,502)}
}

function retryAfterMs(value:string|null,now=Date.now()){
 if(!value)return undefined;
 const seconds=Number(value);
 const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
 return Number.isFinite(delay)&&delay>0?Math.min(delay,MAX_BACKOFF_MS):undefined;
}

function savedBackoff(value:string|undefined,now=Date.now()){
 if(!value)return undefined;
 try{
  const parsed=JSON.parse(value);
  return parsed&&Number.isFinite(parsed.until)&&parsed.until>now?parsed as {until:number;reason?:string}:undefined;
 }catch{return undefined}
}

/**
 * Tenta buscar dados da EA — primeiro pelo relay proxy (Vercel Edge),
 * depois direto se o relay não tiver configurado ou falhar.
 */
export async function ea(path:string,params:Record<string,string>){
 // === TENTATIVA 1: Relay proxy (Vercel Edge) ===
 const relayUrl=secret('EA_RELAY_URL');
 const relayKey=secret('EA_RELAY_KEY');
 if(relayUrl){
  try{
   const url=new URL(relayUrl);
   url.searchParams.set('path',path);
   for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
   const headers:Record<string,string>={Accept:'application/json'};
   if(relayKey)headers.Authorization=`Bearer ${relayKey}`;
   const response=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
   if(response.ok){
    const text=await response.text();
    if(text.length>EA_RESPONSE_LIMIT)throw new EAError('Resposta da EA (via relay) excedeu o limite.');
    let result:unknown;
    try{result=JSON.parse(text)}catch{throw new EAError('Relay não retornou JSON válido.')}
    if(result===null||typeof result!=='object')throw new EAError('Relay retornou formato inesperado.');
    return result;
   }
   // Relay retornou erro — propaga o status da EA se veio pelo header
   const eaStatus=Number(response.headers.get('x-ea-status'));
   const eaRetry=response.headers.get('x-ea-retry-after');
   if(Number.isFinite(eaStatus)&&eaStatus>0){
    throw new EAError(`EA indisponível via relay (HTTP ${eaStatus}). Os dados já salvos foram preservados.`,eaStatus,retryAfterMs(eaRetry));
   }
   // Relay deu erro próprio — tenta direto como fallback
  }catch(e){
   if(e instanceof EAError)throw e;
   // Relay inacessível — tenta chamada direta
  }
 }

 // === TENTATIVA 2: Chamada direta à EA ===
 const url=new URL(`https://proclubs.ea.com/api/fc/${path}`);
 for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
 let response:Response;
 try{
  response=await fetch(url,{headers:{Accept:'application/json, text/plain, */*','Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8',Origin:'https://www.ea.com',Referer:'https://www.ea.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'},signal:AbortSignal.timeout(20000)});
 }catch(e){
  const reason=e instanceof Error&&e.name==='TimeoutError'?'tempo limite excedido':'falha de conexão';
  throw new EAError(`EA indisponível (${reason}). Os dados já salvos foram preservados.`);
 }
 if(!response.ok)throw new EAError(`EA indisponível (HTTP ${response.status}). Os dados já salvos foram preservados.`,response.status,retryAfterMs(response.headers.get('retry-after')));
 const text=await response.text();
 if(text.length>EA_RESPONSE_LIMIT)throw new EAError('Resposta da EA excedeu o limite.');
 let result:unknown;
 try{result=JSON.parse(text)}catch{throw new EAError('A EA não retornou JSON válido. Os dados já salvos foram preservados.');}
 if(result===null||typeof result!=='object')throw new EAError('A EA retornou um formato inesperado. Os dados já salvos foram preservados.');
 return result;
}

export async function sync(team:TeamId,options?:{clearBackoff?:boolean}){
 const c=await config(team);const clubId=c.clubId??'';let hasEA=/^\d+$/.test(clubId);const now=Date.now();
 const lock=await db().prepare('INSERT INTO sync_locks (team, until) VALUES (?, ?) ON CONFLICT(team) DO UPDATE SET until=excluded.until WHERE sync_locks.until < ? RETURNING team').bind(team,now+240000,now).first();
 if(!lock)throw new AppError('Coleta recente ou em andamento. Aguarde alguns minutos.',429);

 // Limpa backoff se solicitado (sync manual do admin)
 if(options?.clearBackoff)await db().prepare("DELETE FROM snapshots WHERE team=? AND source='ea-backoff'").bind(team).run();

 const at=new Date().toISOString();let count=0;const errors:string[]=[];let succeeded=0;let eaSucceeded=0;
 const backoff=options?.clearBackoff?null:await db().prepare("SELECT data FROM snapshots WHERE team=? AND source='ea-backoff'").bind(team).first<{data:string}>();
 const activeBackoff=savedBackoff(backoff?.data,now);
 if(hasEA&&activeBackoff){hasEA=false;errors.push(`EA temporariamente indisponível. Nova tentativa após ${new Date(activeBackoff.until).toISOString()}.`)}
 const sources=hasEA?[['clubs/matches',{matchType:'friendlyMatch',maxResultCount:'20'}],['clubs/info',{}],['members/stats',{}],['members/career/stats',{}],['clubs/overallStats',{}],['clubs/seasonalStats',{}]] as const:[];
 for(const [path,extra] of sources){
  try{
   const raw=await ea(path,{platform:c.platform,clubIds:clubId,clubId,...extra});
   if(path==='clubs/matches'){
    if(!Array.isArray(raw))throw new EAError('A EA retornou partidas em formato inesperado. Os dados já salvos foram preservados.');
    const rows=raw.map(m=>parseEA(m,clubId,extra.matchType!)).filter(Boolean);
    for(let i=0;i<rows.length;i+=15)await db().batch(rows.slice(i,i+15).map(m=>db().prepare('INSERT INTO matches (team, id, data, playedAt, importedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(team,id) DO UPDATE SET data=excluded.data, playedAt=excluded.playedAt, importedAt=excluded.importedAt').bind(team,`${c.edition}:${c.platform}:${m!.id}`,JSON.stringify({...m,id:`${c.edition}:${c.platform}:${m!.id}`}),m!.playedAt,at)));
    count+=rows.length;
   }else await db().prepare('INSERT INTO snapshots (team, source, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(team,source) DO UPDATE SET data=excluded.data, at=excluded.at').bind(team,path,JSON.stringify(raw),at).run();
   succeeded++;eaSucceeded++;
  }catch(e){
   errors.push(`${path}${'matchType' in extra?' · '+extra.matchType:''}: ${e instanceof Error?e.message:'falha'}`);
   const transient=e instanceof EAError&&(e.upstreamStatus===403||e.upstreamStatus===429||(e.upstreamStatus!==undefined&&e.upstreamStatus>=500)||e.upstreamStatus===undefined);
   if(transient){
    const delay=e.retryAfterMs??DEFAULT_BACKOFF_MS;
    await db().prepare("INSERT INTO snapshots (team,source,data,at) VALUES (?,'ea-backoff',?,?) ON CONFLICT(team,source) DO UPDATE SET data=excluded.data,at=excluded.at").bind(team,JSON.stringify({until:Date.now()+delay,reason:e.upstreamStatus?`HTTP ${e.upstreamStatus}`:'network'}),at).run();
    break;
   }
  }
 }
 if(hasEA&&sources.length&&eaSucceeded===sources.length)await db().prepare("DELETE FROM snapshots WHERE team=? AND source='ea-backoff'").bind(team).run();
 const status=succeeded&&!errors.length?'success':succeeded?'partial':'error';
 await db().prepare('INSERT INTO sync_runs (id, team, at, status, detail) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(),team,at,status,JSON.stringify({count,errors})).run();
 return {status,count,errors,at};
}
