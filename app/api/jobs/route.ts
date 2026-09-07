import {secret,equal,json,fail,AppError,db} from '@/lib/server';
import {sync} from '@/lib/ea';
import {isTeam,parseEA,type Match} from '@/lib/domain';
import {config} from '@/lib/server';

// POST /api/jobs → dispara sync normal (GlobalPro + EA via relay/direto)
// POST /api/jobs com body {push:true, data:[...]} → recebe dados EA pré-coletados
export async function POST(request:Request){
 try{
  const key=secret('COLLECTOR_KEY');
  if(!key||!await equal(request.headers.get('authorization')??'',`Bearer ${key}`))throw new AppError('Não autorizado.',401);

  // Verifica se é push de dados externos
  let body:{push?:boolean;data?:Record<string,{matches?:Record<string,unknown[]>;snapshots?:Record<string,unknown>}>}|undefined;
  try{body=await request.json()}catch{}

  if(body?.push&&body?.data){
   return await handlePush(body.data);
  }

  // Sync normal
  const results=[];
  for(const t of ['dtr','vortex'] as const){
   try{results.push({team:t,...await sync(t)})}catch(e){results.push({team:t,error:e instanceof Error?e.message:'falha'})}
  }
  return json({results});
 }catch(e){return fail(e)}
}

async function handlePush(data:Record<string,{matches?:Record<string,unknown[]>;snapshots?:Record<string,unknown>}>){
 const results=[];
 for(const [team,teamData] of Object.entries(data)){
  if(!isTeam(team)){results.push({team,error:'Time inválido'});continue}
  try{
   const c=await config(team);
   const clubId=c.clubId??'';
   const at=new Date().toISOString();
   let count=0;

   // Importa partidas
   if(teamData.matches){
    for(const [matchType,rawMatches] of Object.entries(teamData.matches)){
     if(!Array.isArray(rawMatches))continue;
     const rows=(rawMatches as unknown[]).map(m=>parseEA(m,clubId,matchType)).filter(Boolean) as Match[];
     for(let i=0;i<rows.length;i+=15){
      await db().batch(rows.slice(i,i+15).map(m=>
       db().prepare('INSERT INTO matches (team, id, data, playedAt, importedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(team,id) DO UPDATE SET data=excluded.data, playedAt=excluded.playedAt, importedAt=excluded.importedAt')
        .bind(team,`${c.edition}:${c.platform}:${m.id}`,JSON.stringify({...m,id:`${c.edition}:${c.platform}:${m.id}`}),m.playedAt,at)
      ));
     }
     count+=rows.length;
    }
   }

   // Importa snapshots (clubs/info, members/stats, etc.)
   if(teamData.snapshots){
    for(const [source,snapshotData] of Object.entries(teamData.snapshots)){
     await db().prepare('INSERT INTO snapshots (team, source, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(team,source) DO UPDATE SET data=excluded.data, at=excluded.at')
      .bind(team,source,JSON.stringify(snapshotData),at).run();
    }
   }

   // Limpa backoff de EA se conseguiu importar
   if(count>0){
    await db().prepare("DELETE FROM snapshots WHERE team=? AND source='ea-backoff'").bind(team).run();
   }

   results.push({team,status:'success',count,at});
  }catch(e){
   results.push({team,error:e instanceof Error?e.message:'falha'});
  }
 }
 return json({push:true,results});
}
