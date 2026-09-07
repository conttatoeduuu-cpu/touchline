import { analyzeTeamWithGemini, analyzeWithGemini } from '@/lib/scouting-ai';
import { isTeam, parseEA, type Match } from '@/lib/domain';
import {
  media,
  db,
  session,
  config,
  setConfig,
  secret,
  hash,
  equal,
  passwordHash,
  random,
  createSession,
  cookie,
  sameOrigin,
  body,
  json,
  fail,
  AppError,
  audit,
  rateLimit,
  revokeCurrent,
  readLimited,
} from '@/lib/server';
import { ea, sync } from '@/lib/ea';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ team: string; action: string }> };
type MatchRow = {
  id: string;
  data: string;
  override: string | null;
  playedAt: string;
};
type RecordRow = { id: string; kind: string; data: string; createdAt: string };
type RunRow = { at: string; status: string; detail: string };
type SnapshotRow = { source: string; data: string; at: string };
type VoteRow = { pollId: string; choice: string; count: number };
type MutableMatch = Match & Record<string, unknown>;
type RequestBody = {
  password?: string;
  clubId?: unknown;
  platform?: string;
  name?: unknown;
  formation?: unknown;
  logo?: unknown;
  discordWebhook?: string;
  key?: string;
  model?: string;
  id?: unknown;
  kind?: string;
  data?: Record<string, unknown>;
  pollId?: unknown;
  voter?: unknown;
  choice?: unknown;
  match?: unknown;
  matchId?: unknown;
  matches?: Match[];
};
const kinds = [
  'event',
  'player',
  'scout',
  'scout_target',
  'team_logo',
  'trophy',
  'sponsor',
  'video',
  'poll',
  'lineup',
  'fantasy',
  'note',
];
function text(v: unknown, max = 250) {
  return (
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : ''
  )
    .trim()
    .slice(0, max);
}
function url(v: unknown) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') throw new AppError('Use um link HTTPS válido.');
  if (/^\/api\/(dtr|vortex)\/media\?id=[a-f0-9-]{36}$/.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:') return u.href;
  } catch {}
  throw new AppError('Use um link HTTPS válido.');
}
async function allMatches(team: string) {
  const matches: Match[] = [];
  let playedAt: string | undefined;
  let id: string | undefined;
  while (true) {
    const page =
      playedAt === undefined
        ? await db()
            .prepare(
              'SELECT id,data,override,playedAt FROM matches WHERE team=? ORDER BY playedAt DESC,id LIMIT 500',
            )
            .bind(team)
            .all<MatchRow>()
        : await db()
            .prepare(
              'SELECT id,data,override,playedAt FROM matches WHERE team=? AND (playedAt < ? OR (playedAt = ? AND id > ?)) ORDER BY playedAt DESC,id LIMIT 500',
            )
            .bind(team, playedAt, playedAt, id)
            .all<MatchRow>();
    for (const row of page.results)
      matches.push({
        ...JSON.parse(row.data),
        ...JSON.parse(row.override ?? '{}'),
      } as Match);
    if (page.results.length < 500) break;
    const last = page.results.at(-1)!;
    playedAt = last.playedAt;
    id = last.id;
  }
  return matches;
}
export async function GET(request: Request, ctx: Context) {
  try {
    const { team, action } = await ctx.params;
    const s = await session(team);
    if (action === 'media') {
      const id = new URL(request.url).searchParams.get('id') ?? '';
      if (!/^[a-f0-9-]{36}$/.test(id))
        throw new AppError('Imagem não encontrada.', 404);
      const object = await media().get(`${team}/${id}`);
      if (!object) throw new AppError('Imagem não encontrada.', 404);
      return new Response(object.body, {
        headers: {
          'Content-Type':
            object.httpMetadata?.contentType ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (action === 'data') {
      const [matches, records, runs, snapshots, votes] = await Promise.all([
        allMatches(team),
        db()
          .prepare(
            'SELECT id,kind,data,createdAt FROM records WHERE team=? ORDER BY createdAt DESC LIMIT 1000',
          )
          .bind(team)
          .all<RecordRow>(),
        db()
          .prepare(
            'SELECT at,status,detail FROM sync_runs WHERE team=? ORDER BY at DESC LIMIT 12',
          )
          .bind(team)
          .all<RunRow>(),
        db()
          .prepare('SELECT source,data,at FROM snapshots WHERE team=?')
          .bind(team)
          .all<SnapshotRow>(),
        db()
          .prepare(
            'SELECT pollId,choice,COUNT(*) AS count FROM votes WHERE team=? GROUP BY pollId,choice',
          )
          .bind(team)
          .all<VoteRow>(),
      ]);
      const c = s.config;
      return json({
        role: s.role,
        settings: {
          name: c.name,
          clubId: c.clubId,
          platform: c.platform,
          edition: c.edition,
          formation: c.formation,
          logo: c.logo,
          discordConfigured: !!c.discordWebhook,
          aiConfigured: !!c.geminiKey,
          aiModel: c.geminiModel ?? 'gemini-3.5-flash',
        },
        matches: matches.filter((m) => m.type === 'friendlyMatch'),
        records: records.results.map((r) => ({
          ...r,
          data: JSON.parse(r.data),
        })),
        runs: runs.results.map((r) => ({ ...r, detail: JSON.parse(r.detail) })),
        snapshots: snapshots.results.map((r) => ({
          ...r,
          data: JSON.parse(r.data),
        })),
        votes: votes.results,
      });
    }
    if (action === 'export') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  team,
                  exportedAt: new Date().toISOString(),
                }).slice(0, -1) + ',"matches":[',
              ),
            );
            let offset = 0;
            let first = true;
            while (true) {
              const page = await db()
                .prepare(
                  'SELECT id,data,override,playedAt FROM matches WHERE team=? ORDER BY playedAt DESC,id LIMIT 50 OFFSET ?',
                )
                .bind(team, offset)
                .all<MatchRow>();
              for (const row of page.results) {
                const m = {
                  ...JSON.parse(row.data),
                  ...JSON.parse(row.override ?? '{}'),
                };
                if (m.type !== 'friendlyMatch') continue;
                controller.enqueue(
                  encoder.encode((first ? '' : ',') + JSON.stringify(m)),
                );
                first = false;
              }
              if (page.results.length < 50) break;
              offset += 50;
            }
            controller.enqueue(encoder.encode(']}'));
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${team}-partidas.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    if (action === 'audit') {
      await session(team, true);
      return json(
        (
          await db()
            .prepare(
              'SELECT action,detail,at FROM audit WHERE team=? ORDER BY at DESC LIMIT 100',
            )
            .bind(team)
            .all()
        ).results,
      );
    }
    throw new AppError('Rota não encontrada.', 404);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, ctx: Context) {
  try {
    sameOrigin(request);
    const { team, action } = await ctx.params;
    if (!isTeam(team)) throw new AppError('Equipe inválida.', 404);
    if (action === 'media') {
      await session(team, true);
      if (Number(request.headers.get('content-length') ?? 0) > 2200000)
        throw new AppError('Limite de 2 MB.', 413);
      const bytesIn = await readLimited(request, 2200000);
      const form = await new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: bytesIn,
      }).formData();
      const file = form.get('file');
      if (
        !file ||
        typeof file === 'string' ||
        file.size > 2000000 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw new AppError('Envie PNG, JPEG ou WebP de até 2 MB.');
      const bytes = await file.arrayBuffer();
      const sig = new Uint8Array(bytes);
      const valid =
        file.type === 'image/png'
          ? sig[0] === 137 && sig[1] === 80 && sig[2] === 78
          : file.type === 'image/jpeg'
            ? sig[0] === 255 && sig[1] === 216
            : sig[0] === 82 && sig[1] === 73 && sig[8] === 87 && sig[9] === 69;
      if (!valid) throw new AppError('Conteúdo da imagem inválido.');
      const id = crypto.randomUUID();
      await media().put(`${team}/${id}`, bytes, {
        httpMetadata: { contentType: file.type },
      });
      await audit(team, 'media', 'Imagem adicionada');
      return json({ url: `/api/${team}/media?id=${id}` });
    }
    const b = await body<RequestBody>(request);
    if (action === 'login') {
      await rateLimit(team, request);
      const c = await config(team);
      const pass = b.password ?? '';
      const valid = c.passwordHash
        ? await equal(
            await passwordHash(pass, c.passwordSalt ?? ''),
            c.passwordHash,
          )
        : !!secret(`${team.toUpperCase()}_ADMIN`) &&
          (await equal(pass, secret(`${team.toUpperCase()}_ADMIN`)));
      if (!valid) throw new AppError('Senha administrativa incorreta.', 401);
      await revokeCurrent(team);
      const sess = await createSession(team, 'admin');
      await audit(team, 'login', 'Acesso administrativo');
      const r = json({ ok: true });
      r.headers.set(
        'Set-Cookie',
        cookie(team, sess.token, sess.maxAge, request),
      );
      return r;
    }
    if (action === 'logout') {
      await session(team);
      await revokeCurrent(team);
      const sess = await createSession(team, 'viewer');
      const r = json({ ok: true });
      r.headers.set(
        'Set-Cookie',
        cookie(team, sess.token, sess.maxAge, request),
      );
      return r;
    }
    const s = await session(team, action !== 'vote');
    if (action === 'sync')
      return json(await sync(team, { clearBackoff: true }));
    if (action === 'settings') {
      const c = s.config;
      const clubId = text(b.clubId, 20);
      const platform = b.platform;
      if (clubId && !/^\d+$/.test(clubId))
        throw new AppError('ID do clube deve conter apenas números.');
      if (
        !platform ||
        !['common-gen5', 'common-gen4', 'pc', 'ps4', 'xboxone'].includes(
          platform,
        )
      )
        throw new AppError('Plataforma inválida.');
      if (
        c.clubId &&
        c.clubId !== clubId &&
        (await db()
          .prepare(
            "SELECT id FROM matches WHERE team=? AND json_extract(data,'$.type') IN ('leagueMatch','friendlyMatch','playoffMatch') LIMIT 1",
          )
          .bind(team)
          .first())
      )
        throw new AppError(
          'Este ambiente já tem partidas. Para trocar de clube, preserve ou exporte o histórico antes.',
        );
      await setConfig(team, {
        ...c,
        name: text(b.name) || c.name,
        clubId,
        platform,
        edition: 'fc',
        formation: text(b.formation, 20) || '4-3-3',
        logo: url(b.logo),
        ...(b.discordWebhook !== undefined
          ? {
              discordWebhook: b.discordWebhook
                ? validWebhook(b.discordWebhook)
                : '',
            }
          : {}),
      });
      await audit(team, 'settings', 'Configuração do clube atualizada');
      return json({ ok: true });
    }
    if (action === 'ai-settings') {
      if (typeof b.key !== 'string' || b.key.length < 10 || b.key.length > 300)
        throw new AppError('Chave inválida.');
      if (typeof b.model !== 'string' || !/^gemini-[a-z0-9.-]+$/.test(b.model))
        throw new AppError('Modelo inválido.');
      await setConfig(team, {
        ...s.config,
        geminiKey: b.key,
        geminiModel: b.model,
      });
      await audit(team, 'ai-settings', 'Integração de análise configurada');
      return json({ ok: true });
    }
    if (action === 'analyze') {
      const geminiKey = s.config.geminiKey;
      if (!geminiKey)
        throw new AppError('Configure a chave Gemini em Administração.');
      const recordId = text(b.id);
      const row = await db()
        .prepare(
          "SELECT data FROM records WHERE team=? AND id=? AND kind='scout'",
        )
        .bind(team, recordId)
        .first<{ data: string }>();
      if (!row) throw new AppError('Relatório não encontrado.', 404);
      const data = JSON.parse(row.data) as {
        matches: Record<string, unknown>[];
        [key: string]: unknown;
      };
      if (!Array.isArray(data.matches))
        throw new AppError('Relatório inválido.', 500);
      const friendlyMatches = data.matches.filter(
        (m) => m.type === 'friendlyMatch',
      );
      if (!friendlyMatches.length)
        throw new AppError(
          'Este dossiê não possui amistosos para análise.',
          400,
        );
      const summary = await analyzeWithGemini(
        geminiKey,
        s.config.geminiModel ?? 'gemini-3.5-flash',
        friendlyMatches.map((m) => ({ ...m, raw: undefined })),
      );
      await db()
        .prepare('UPDATE records SET data=? WHERE team=? AND id=?')
        .bind(
          JSON.stringify({
            ...data,
            matches: friendlyMatches,
            aiAnalysis: summary,
            aiScope: 'friendlyMatch',
            aiModel: s.config.geminiModel,
            aiAt: new Date().toISOString(),
          }),
          team,
          recordId,
        )
        .run();
      await audit(team, 'analyze', recordId);
      return json({ ok: true });
    }
    if (action === 'analyze-team') {
      const geminiKey = s.config.geminiKey;
      if (!geminiKey)
        throw new AppError('Configure a chave Gemini em Administração.');
      const friendlyMatches = (await allMatches(team))
        .filter((match) => match.type === 'friendlyMatch' && !match.excluded)
        .slice(0, 30);
      if (!friendlyMatches.length)
        throw new AppError('Ainda não há amistosos para analisar.', 400);
      const evidence = friendlyMatches.map((match) => ({
        id: match.id,
        playedAt: match.playedAt,
        opponent: match.opponent,
        goalsFor: match.goalsFor,
        goalsAgainst: match.goalsAgainst,
        type: 'friendlyMatch',
        players: match.players.map((player) => ({ ...player, raw: undefined })),
      }));
      const report = await analyzeTeamWithGemini(
        geminiKey,
        s.config.geminiModel ?? 'gemini-3.5-flash',
        evidence,
      );
      const id = `team-analysis:${team}`;
      const at = new Date().toISOString();
      const data = {
        name: 'Análise assistida do time',
        scope: 'team-analysis',
        analysis: report,
        sampleSize: friendlyMatches.length,
        model: s.config.geminiModel ?? 'gemini-3.5-flash',
        at,
      };
      await db()
        .prepare(
          "INSERT INTO records (id,team,kind,data,createdAt) VALUES (?,?,?,?,?) ON CONFLICT(team,id) DO UPDATE SET data=excluded.data,createdAt=excluded.createdAt WHERE records.kind='note'",
        )
        .bind(id, team, 'note', JSON.stringify(data), at)
        .run();
      await audit(team, 'analyze-team', `${friendlyMatches.length} amistosos`);
      return json({ ok: true, report });
    }
    if (action === 'password') {
      if (
        typeof b.password !== 'string' ||
        b.password.length < 12 ||
        b.password.length > 200
      )
        throw new AppError('Use uma senha com pelo menos 12 caracteres.');
      const salt = random();
      await setConfig(team, {
        ...s.config,
        passwordSalt: salt,
        passwordHash: await passwordHash(b.password, salt),
      });
      await db()
        .prepare("DELETE FROM sessions WHERE team=? AND role='admin'")
        .bind(team)
        .run();
      const sess = await createSession(team, 'admin');
      await audit(team, 'password', 'Senha administrativa alterada');
      const r = json({ ok: true });
      r.headers.set(
        'Set-Cookie',
        cookie(team, sess.token, sess.maxAge, request),
      );
      return r;
    }
    if (action === 'rotate-link') {
      const token = random();
      await setConfig(team, {
        ...s.config,
        viewerHash: await hash(token),
        accessVersion: (s.config.accessVersion ?? 0) + 1,
      });
      await db().prepare('DELETE FROM sessions WHERE team=?').bind(team).run();
      const sess = await createSession(team, 'admin');
      const r = json({
        url: `${new URL(request.url).origin}/access/${team}/${token}`,
      });
      r.headers.set(
        'Set-Cookie',
        cookie(team, sess.token, sess.maxAge, request),
      );
      await audit(
        team,
        'access',
        'Link privado rotacionado; acessos anteriores revogados',
      );
      return r;
    }
    if (action === 'search') {
      const name = text(b.name, 80);
      if (name.length < 3) throw new AppError('Informe pelo menos 3 letras.');
      return json(
        await ea('allTimeLeaderboard/search', {
          platform: s.config.platform,
          clubName: name,
        }),
      );
    }
    if (action === 'scout') {
      const id = text(b.clubId, 20);
      if (!/^\d+$/.test(id)) throw new AppError('Informe o ID do adversário.');
      const raw = await ea('clubs/matches', {
        platform: s.config.platform,
        clubIds: id,
        matchType: 'friendlyMatch',
        maxResultCount: '100',
      });
      if (!Array.isArray(raw))
        throw new AppError('Clube não retornou amistosos.', 502);
      const matches = raw
        .map((m) => parseEA(m, id, 'friendlyMatch'))
        .filter((m) => m?.type === 'friendlyMatch')
        .filter(
          (m, index, list) =>
            list.findIndex((candidate) => candidate?.id === m?.id) === index,
        );
      const wins = matches.filter((m) => m!.goalsFor > m!.goalsAgainst).length;
      const data = {
        name: text(b.name) || `Clube ${id}`,
        clubId: id,
        matches,
        summary: `${matches.length} amistosos recentes; ${wins} vitórias. ${matches.reduce((n, m) => n + m!.goalsFor, 0)} gols marcados e ${matches.reduce((n, m) => n + m!.goalsAgainst, 0)} sofridos. Amostra exclusiva de amistosos; não infere formação ou movimentação.`,
        at: new Date().toISOString(),
      };
      const recordId = crypto.randomUUID();
      await db()
        .prepare(
          'INSERT INTO records (id,team,kind,data,createdAt) VALUES (?,?,?,?,?)',
        )
        .bind(recordId, team, 'scout', JSON.stringify(data), data.at)
        .run();
      return json({ ok: true, id: recordId });
    }
    if (action === 'record') {
      const kind = b.kind;
      if (!kind || !kinds.includes(kind))
        throw new AppError('Categoria inválida.');
      const data = b.data;
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        JSON.stringify(data).length > 80000
      )
        throw new AppError('Conteúdo inválido.');
      for (const k of ['url', 'video', 'logo', 'photo', 'live'])
        if (data[k]) data[k] = url(data[k]);
      if (!text(data.name ?? data.title))
        throw new AppError('Preencha o nome ou título.');
      if (
        kind === 'event' &&
        (typeof data.date !== 'string' ||
          !Number.isFinite(Date.parse(data.date)))
      )
        throw new AppError('Informe a data da partida.');
      if (
        kind === 'poll' &&
        (!Array.isArray(data.options) ||
          data.options.length < 2 ||
          data.options.length > 20)
      )
        throw new AppError('Adicione de 2 a 20 opções.');
      const id = text(b.id) || crypto.randomUUID();
      const saved = await db()
        .prepare(
          'INSERT INTO records (id,team,kind,data,createdAt) VALUES (?,?,?,?,?) ON CONFLICT(team,id) DO UPDATE SET data=excluded.data WHERE records.kind=excluded.kind RETURNING id',
        )
        .bind(id, team, kind, JSON.stringify(data), new Date().toISOString())
        .first();
      if (!saved)
        throw new AppError('Este ID já pertence a outra categoria.', 409);
      await audit(team, 'record', `${kind}: ${text(data.name ?? data.title)}`);
      return json({ ok: true, id });
    }
    if (action === 'delete-media') {
      const id = text(b.id);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError('Imagem inválida.');
      await media().delete(`${team}/${id}`);
      return json({ ok: true });
    }
    if (action === 'delete-match') {
      await db()
        .prepare('DELETE FROM matches WHERE team=? AND id=?')
        .bind(team, text(b.id))
        .run();
      await audit(team, 'delete-match', text(b.id));
      return json({ ok: true });
    }
    if (action === 'reset-match') {
      await db()
        .prepare('UPDATE matches SET override=NULL WHERE team=? AND id=?')
        .bind(team, text(b.id))
        .run();
      await audit(team, 'reset-match', text(b.id));
      return json({ ok: true });
    }
    if (action === 'delete') {
      const id = text(b.id);
      await db().batch([
        db()
          .prepare('DELETE FROM records WHERE team=? AND id=?')
          .bind(team, id),
        db()
          .prepare('DELETE FROM votes WHERE team=? AND pollId=?')
          .bind(team, id),
      ]);
      await audit(team, 'delete', id);
      return json({ ok: true });
    }
    if (action === 'match') {
      const m = b.match;
      validateMatch(m);
      const id = m.id ? text(m.id) : `manual:${crypto.randomUUID()}`;
      const existing = await db()
        .prepare('SELECT id FROM matches WHERE team=? AND id=?')
        .bind(team, id)
        .first();
      const data = {
        ...m,
        id,
        playedAt: new Date(m.playedAt).toISOString(),
        opponent: text(m.opponent),
        video: url(m.video),
        competition: text(m.competition),
        players: Array.isArray(m.players) ? m.players : [],
        type: m.type ?? 'manual',
      };
      if (existing) {
        const correction: Record<string, unknown> = { ...data };
        delete correction.raw;
        delete correction.playerStats;
        await db()
          .prepare('UPDATE matches SET override=? WHERE team=? AND id=?')
          .bind(JSON.stringify(correction), team, id)
          .run();
      } else {
        await db()
          .prepare(
            'INSERT INTO matches (team,id,data,playedAt,importedAt) VALUES (?,?,?,?,?)',
          )
          .bind(
            team,
            id,
            JSON.stringify(data),
            data.playedAt,
            new Date().toISOString(),
          )
          .run();
      }
      await audit(team, 'match', id);
      return json({ ok: true });
    }
    if (action === 'import') {
      if (!Array.isArray(b.matches) || b.matches.length > 200)
        throw new AppError('Importe até 200 partidas por arquivo.');
      const list = b.matches.map((m: Match) => {
        validateMatch(m);
        return {
          ...m,
          type: 'friendlyMatch',
          id: text(m.id) || `manual:${crypto.randomUUID()}`,
          video: url(m.video),
          players: Array.isArray(m.players) ? m.players : [],
        };
      });
      for (let i = 0; i < list.length; i += 15)
        await db().batch(
          list
            .slice(i, i + 15)
            .map((m: Match) =>
              db()
                .prepare(
                  'INSERT INTO matches (team,id,data,playedAt,importedAt) VALUES (?,?,?,?,?) ON CONFLICT(team,id) DO UPDATE SET data=excluded.data,playedAt=excluded.playedAt,importedAt=excluded.importedAt',
                )
                .bind(
                  team,
                  m.id,
                  JSON.stringify(m),
                  new Date(m.playedAt).toISOString(),
                  new Date().toISOString(),
                ),
            ),
        );
      await audit(team, 'import', `${list.length} partidas`);
      return json({ ok: true, count: list.length });
    }
    if (action === 'vote') {
      const poll = await db()
        .prepare(
          "SELECT data FROM records WHERE team=? AND id=? AND kind='poll'",
        )
        .bind(team, text(b.pollId))
        .first<{ data: string }>();
      if (!poll) throw new AppError('Enquete não encontrada.', 404);
      const p = JSON.parse(poll.data) as {
        closed?: boolean;
        endsAt?: string;
        options?: unknown[];
      };
      if (p.closed || (p.endsAt && Date.parse(p.endsAt) < Date.now()))
        throw new AppError('Enquete encerrada.');
      if (typeof b.choice !== 'string' || !p.options?.includes(b.choice))
        throw new AppError('Opção inválida.');
      if (typeof b.voter !== 'string' || !/^[a-zA-Z0-9-]{20,80}$/.test(b.voter))
        throw new AppError('Identificador inválido.');
      await db()
        .prepare(
          'INSERT INTO votes (team,pollId,voter,choice) VALUES (?,?,?,?) ON CONFLICT(team,pollId,voter) DO UPDATE SET choice=excluded.choice',
        )
        .bind(team, text(b.pollId), await hash(b.voter), b.choice)
        .run();
      return json({ ok: true });
    }
    if (action === 'discord') {
      const hook = s.config.discordWebhook;
      if (!hook) throw new AppError('Configure o webhook do Discord.');
      const matchId = text(b.matchId);
      const matches = await allMatches(team);
      const m = matches.find((m: Match) => m.id === matchId);
      if (!m) throw new AppError('Partida não encontrada.', 404);
      const r = await fetch(validWebhook(hook), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `${s.config.name} ${m.goalsFor} × ${m.goalsAgainst} ${m.opponent}`,
          allowed_mentions: { parse: [] },
        }),
      });
      if (!r.ok) throw new AppError('Discord recusou a publicação.', 502);
      await audit(team, 'discord', m.id);
      return json({ ok: true });
    }
    throw new AppError('Ação não encontrada.', 404);
  } catch (e) {
    return fail(e);
  }
}
function validWebhook(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'discord.com' ||
    !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)
  )
    throw new AppError('Webhook Discord inválido.');
  return u.href;
}
function validateMatch(value: unknown): asserts value is MutableMatch {
  if (!value || typeof value !== 'object')
    throw new AppError(
      'Partida inválida: informe adversário, data e placar entre 0 e 99.',
    );
  const m = value as Record<string, unknown>;
  if (
    typeof m.opponent !== 'string' ||
    typeof m.playedAt !== 'string' ||
    !Number.isFinite(Date.parse(m.playedAt)) ||
    ![m.goalsFor, m.goalsAgainst].every(
      (n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 99,
    )
  )
    throw new AppError(
      'Partida inválida: informe adversário, data e placar entre 0 e 99.',
    );
  if (
    m.players !== undefined &&
    (!Array.isArray(m.players) || m.players.length > 100)
  )
    throw new AppError('Estatísticas de jogadores inválidas.');
  for (const valuePlayer of m.players ?? []) {
    if (!valuePlayer || typeof valuePlayer !== 'object')
      throw new AppError('Jogador inválido.');
    const p = valuePlayer as Record<string, unknown>;
    if (
      typeof p.id !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.own !== 'boolean'
    )
      throw new AppError('Jogador inválido.');
    for (const k of [
      'goals',
      'assists',
      'rating',
      'shots',
      'passes',
      'passAttempts',
      'tackles',
      'tackleAttempts',
      'saves',
      'redCards',
      'motm',
      'seconds',
    ]) {
      if (p[k] === undefined) p[k] = null;
      if (
        p[k] !== null &&
        (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k] < 0)
      )
        throw new AppError('Estatística de jogador inválida.');
    }
    p.position = typeof p.position === 'string' ? p.position : '—';
    p.clubId = typeof p.clubId === 'string' ? p.clubId : 'manual';
  }
}
