export const TEAMS={dtr:{name:'DTR Esports',short:'DTR',accent:'#f5f5f2',logo:'/teams/dtr.png'},vortex:{name:'Vortex EC',short:'VTX',accent:'#ff9d2e',logo:'/teams/vortex.png'}};
export type TeamId=keyof typeof TEAMS;
export const isTeam=(value:string):value is TeamId=>Object.hasOwn(TEAMS,value);
export type Match={id:string;playedAt:string;opponent:string;goalsFor:number;goalsAgainst:number;type:string;competition?:string;video?:string;excluded?:boolean;wo?:boolean;players:PlayerLine[];raw?:unknown};
export type PlayerLine={id:string;name:string;position:string;own:boolean;clubId:string;goals:number|null;assists:number|null;rating:number|null;shots:number|null;passes:number|null;passAttempts:number|null;tackles:number|null;tackleAttempts:number|null;saves:number|null;redCards:number|null;motm:number|null;seconds:number|null;raw?:Record<string,unknown>};
export type RecordItem<T=unknown>={id:string;kind:string;data:T;createdAt:string};
type JsonObject=Record<string,unknown>;
type StatKey='goals'|'assists'|'passes'|'passAttempts'|'tackles'|'tackleAttempts'|'shots'|'saves'|'motm'|'redCards';
type AggregateRow={id:string;name:string;position:string;games:number;wins:number;goals:number;assists:number;rating:number;ratings:number;passes:number;passAttempts:number;tackles:number;tackleAttempts:number;shots:number;saves:number;motm:number;redCards:number;available:Partial<Record<StatKey,true>>};
const statKeys:StatKey[]=['goals','assists','passes','passAttempts','tackles','tackleAttempts','shots','saves','motm','redCards'];
const object=(value:unknown):JsonObject|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:undefined;
export const num=(x:unknown):number|null=>x===undefined||x===null||x===''||!Number.isFinite(Number(x))?null:Number(x);
export function parseEA(value:unknown,clubId:string,type:string):Match|null{
 const raw=object(value);const clubs=object(raw?.clubs);const us=object(clubs?.[clubId]);const opponentId=clubs?Object.keys(clubs).find(k=>k!==clubId):undefined;const opponent=object(clubs?.[opponentId??'']);
 if(!raw||!us||!opponent||!raw.matchId||!num(raw.timestamp)||num(us.goals)===null||num(opponent.goals)===null)return null;
 const players:PlayerLine[]=[];const playerClubs=object(raw.players)??{};
 for(const [cid,valueRows]of Object.entries(playerClubs)){const rows=object(valueRows)??{};for(const [pid,valueStats]of Object.entries(rows)){const p=object(valueStats);if(!p)continue;players.push({id:pid,clubId:cid,own:cid===clubId,name:typeof p.playername==='string'?p.playername:pid,position:typeof p.pos==='string'||typeof p.pos==='number'?String(p.pos):'—',goals:num(p.goals),assists:num(p.assists),rating:num(p.rating),shots:num(p.shots),passes:num(p.passesmade),passAttempts:num(p.passattempts),tackles:num(p.tacklesmade),tackleAttempts:num(p.tackleattempts),saves:num(p.saves),redCards:num(p.redcards),motm:num(p.man_of_the_match??p.mom),seconds:num(p.secondsPlayed??p.gameTime),raw:p})}}
 const details=object(opponent.details);const opponentName=typeof details?.name==='string'?details.name:typeof opponent.name==='string'?opponent.name:opponentId??'Adversário';
 const matchId=typeof raw.matchId==='string'||typeof raw.matchId==='number'?String(raw.matchId):'';
 return{id:matchId,playedAt:new Date(Number(raw.timestamp)*1000).toISOString(),opponent:opponentName,goalsFor:Number(us.goals),goalsAgainst:Number(opponent.goals),type,players,raw};
}
export const result=(m:Match)=>m.goalsFor>m.goalsAgainst?'V':m.goalsFor<m.goalsAgainst?'D':'E';
export function aggregate(matches:Match[]){const map=new Map<string,AggregateRow>();for(const m of matches.filter(m=>!m.excluded))for(const p of m.players.filter(p=>p.own)){const row=map.get(p.id)??{id:p.id,name:p.name,position:p.position,games:0,wins:0,goals:0,assists:0,rating:0,ratings:0,passes:0,passAttempts:0,tackles:0,tackleAttempts:0,shots:0,saves:0,motm:0,redCards:0,available:{}};row.games++;row.wins+=result(m)==='V'?1:0;for(const key of statKeys)if(p[key]!==null){row[key]+=p[key];row.available[key]=true}if(p.rating!==null){row.rating+=p.rating;row.ratings++}map.set(p.id,row)}return[...map.values()].map(p=>({...p,rating:p.ratings?p.rating/p.ratings:null,passAccuracy:p.passAttempts?100*p.passes/p.passAttempts:null,tackleRate:p.tackleAttempts?100*p.tackles/p.tackleAttempts:null,conversion:p.shots?100*p.goals/p.shots:null}))}
