'use client';
import { useId, useMemo, useState, useEffect, type ReactNode } from 'react';
import { BarChart2, BrainCircuit, Shield, Target, Users, Activity } from 'lucide-react';
import { aggregate, type Match, type PlayerLine, result } from '@/lib/domain';

type Player = ReturnType<typeof aggregate>[number];
type View = 'summary' | 'attack' | 'defence' | 'players' | 'trends' | 'rivals' | 'assisted';
type Val = number | string | null | ReactNode;

interface Props {
  matches: Match[];
  players: unknown[];
  teamName: string;
  admin?: boolean;
  aiReport?: string | null;
  onAnalyzeTeam?: () => Promise<void>;
}

const fmt = (n: number | null | undefined, d = 0) => n == null ? <NR /> : n.toLocaleString('pt-BR', { maximumFractionDigits: d });
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const n = (v: unknown) => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

function NR() {
  return <span className="nr-badge" title="Não Registrado pela EA">N/R<small style={{display: 'none'}}>Não registrado</small></span>;
}

const raw = (p: PlayerLine, keys: string[]) => {
  for (const k of keys) {
    const v = n(p.raw?.[k]);
    if (v !== null) return v;
  }
  return null;
};

const totalRaw = (lines: PlayerLine[], keys: string[]) => {
  const a = lines.map(p => raw(p, keys)).filter((v): v is number => v !== null);
  return a.length ? a.reduce((x, v) => x + v, 0) : null;
};

const matchStat = (m: Match, key: keyof PlayerLine) => {
  const a = m.players.filter(p => p.own).map(p => p[key]).filter((v): v is number => typeof v === 'number');
  return a.length ? a.reduce((x, v) => x + v, 0) : null;
};

const points = (m: Match) => result(m) === 'V' ? 3 : result(m) === 'E' ? 1 : 0;

function corr(a: [number, number][]) {
  if (a.length < 4) return null;
  const x = a.reduce((s, [v]) => s + v, 0) / a.length;
  const y = a.reduce((s, [, v]) => s + v, 0) / a.length;
  const num = a.reduce((s, [u, v]) => s + (u - x) * (v - y), 0);
  const dx = Math.sqrt(a.reduce((s, [u]) => s + (u - x) ** 2, 0));
  const dy = Math.sqrt(a.reduce((s, [, v]) => s + (v - y) ** 2, 0));
  return dx && dy ? num / (dx * dy) : null;
}

function stdDev(arr: number[]) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b) / arr.length;
  return Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (arr.length - 1));
}

function parseMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let content = line;
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    if (content.startsWith('- ')) {
      return <li key={i} dangerouslySetInnerHTML={{ __html: content.substring(2) }} />;
    }
    if (/^\d+\.\s/.test(content)) {
      return <li key={i} dangerouslySetInnerHTML={{ __html: content.replace(/^\d+\.\s/, '') }} className="numbered" />;
    }
    if (content.startsWith('# ')) return <h3 key={i} dangerouslySetInnerHTML={{ __html: content.substring(2) }} />;
    if (content.startsWith('## ')) return <h4 key={i} dangerouslySetInnerHTML={{ __html: content.substring(3) }} />;
    
    return content.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: content }} /> : <br key={i} />;
  });
}

export function AnalyticsCenter({ matches, teamName, admin = false, aiReport, onAnalyzeTeam }: Props) {
  const [view, setView] = useState<View>('summary');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = useId();

  useEffect(() => {
    if (view === 'assisted' && !aiReport && admin && onAnalyzeTeam && !busy) {
      setBusy(true); setError('');
      onAnalyzeTeam().catch(e => setError(e instanceof Error ? e.message : 'A análise não pôde ser concluída.')).finally(() => setBusy(false));
    }
  }, [view, aiReport, admin, onAnalyzeTeam, busy]);

  const games = useMemo(() => matches.filter(m => !m.excluded && m.type === 'friendlyMatch').sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt)), [matches]);
  const players = useMemo(() => aggregate(games), [games]);
  const lines = useMemo(() => games.flatMap(m => m.players.filter(p => p.own)), [games]);

  const stats = useMemo(() => {
    const sum = (k: keyof PlayerLine) => {
      const a = lines.map(p => p[k]).filter((v): v is number => typeof v === 'number');
      return a.length ? a.reduce((x, v) => x + v, 0) : null;
    };
    const j = games.length, w = games.filter(m => result(m) === 'V').length, e = games.filter(m => result(m) === 'E').length;
    const gf = games.reduce((x, m) => x + m.goalsFor, 0), ga = games.reduce((x, m) => x + m.goalsAgainst, 0);
    const sh = sum('shots'), pa = sum('passAttempts'), pm = sum('passes'), ta = sum('tackleAttempts'), tm = sum('tackles'), sec = sum('seconds');
    const ratings = lines.map(p => p.rating).filter((v): v is number => v !== null);
    
    return {
      j, w, e, d: j - w - e, gf, ga, rate: j ? (w * 3 + e) / (j * 3) * 100 : 0,
      clean: games.filter(m => !m.goalsAgainst).length,
      shots: sh, conversion: sh ? gf / sh * 100 : null,
      passes: pm, passAttempts: pa, passRate: pa ? Number(pm ?? 0) / pa * 100 : null,
      tackles: tm, tackleAttempts: ta, tackleRate: ta ? Number(tm ?? 0) / ta * 100 : null,
      saves: sum('saves'), cards: sum('redCards'), motm: sum('motm'),
      assists: sum('assists'), playerGoals: sum('goals'),
      minutes: sec == null ? null : sec / 60,
      rating: ratings.length ? ratings.reduce((x, v) => x + v, 0) / ratings.length : null,
      ratings: ratings.length,
      cleanRaw: totalRaw(lines, ['cleanSheets', 'cleansheets', 'cleanSheet']),
      concededRaw: totalRaw(lines, ['goalsConceded', 'goalsconceded']),
      dive: totalRaw(lines, ['divingSaves', 'divingsaves', 'ballDiveSaves']),
      reflex: totalRaw(lines, ['reflexSaves', 'reflexsaves']),
      standing: totalRaw(lines, ['standingSaves', 'standingsaves']),
      penalty: totalRaw(lines, ['penaltySaves', 'penaltysaves'])
    };
  }, [games, lines]);

  const periods = useMemo(() => {
    const z = Math.ceil(games.length / 3);
    return [['Início', games.slice(0, z)], ['Intermediário', games.slice(z, z * 2)], ['Recente', games.slice(z * 2)]] as const;
  }, [games]);

  const trends = periods.filter(([, a]) => a.length).map(([label, a]) => {
    const w = a.filter(m => result(m) === 'V').length, e = a.filter(m => result(m) === 'E').length;
    const gf = a.reduce((x, m) => x + m.goalsFor, 0), ga = a.reduce((x, m) => x + m.goalsAgainst, 0);
    return { label, j: a.length, w, e, d: a.length - w - e, gf, ga, rate: (w * 3 + e) / (a.length * 3) * 100 };
  });

  const pairs = (x: (m: Match) => number | null, y: (m: Match) => number) => games.map(m => [x(m), y(m)] as const).filter((v): v is readonly [number, number] => v[0] !== null).map(v => [v[0], v[1]] as [number, number]);
  const relations = [
    ['Finalizações × gols', corr(pairs(m => matchStat(m, 'shots'), m => m.goalsFor))],
    ['Precisão de passe × pontos', corr(pairs(m => { const a = matchStat(m, 'passes'), b = matchStat(m, 'passAttempts'); return a !== null && b ? a / b * 100 : null; }, points))],
    ['Desarmes × gols sofridos', corr(pairs(m => matchStat(m, 'tackles'), m => m.goalsAgainst))]
  ] as [string, number | null][];

  const rivals = useMemo(() => {
    const map = new Map<string, { name: string; j: number; w: number; e: number; d: number; gf: number; ga: number; last: string }>();
    for (const m of games) {
      const v = map.get(m.opponent) ?? { name: m.opponent, j: 0, w: 0, e: 0, d: 0, gf: 0, ga: 0, last: m.playedAt };
      v.j++; v.gf += m.goalsFor; v.ga += m.goalsAgainst;
      const r = result(m);
      v[r === 'V' ? 'w' : r === 'E' ? 'e' : 'd']++;
      if (Date.parse(m.playedAt) > Date.parse(v.last)) v.last = m.playedAt;
      map.set(m.opponent, v);
    }
    return [...map.values()].filter(v => v.name.toLowerCase().includes(query.toLowerCase()));
  }, [games, query]);

  const leaders = (k: keyof Player) => [...players].filter(p => Number(p[k]) > 0).sort((a, b) => Number(b[k]) - Number(a[k])).slice(0, 7);

  if (!stats.j) return <div className="analytics-empty"><BarChart2 /><h3>Aguardando amistosos da EA</h3><p>Liga, playoffs, registros manuais e GlobalPro ficam fora deste recorte.</p></div>;

  const tabs: [View, string][] = [['summary', 'Briefing'], ['attack', 'Ataque'], ['defence', 'Defesa'], ['players', 'Jogadores'], ['trends', 'Tendências'], ['rivals', 'Rivais'], ['assisted', 'IA assistida']];
  const insights = [
    `${fmt(stats.rate, 1)}% de aproveitamento em ${stats.j} amistosos (${stats.w}V · ${stats.e}E · ${stats.d}D).`,
    `Saldo ${stats.gf - stats.ga >= 0 ? 'positivo' : 'negativo'} de ${Math.abs(stats.gf - stats.ga)} gols.`,
    stats.j < 5 ? 'Amostra curta: trate a leitura como sinal descritivo.' : 'Leitura automática determinística; confirme padrões táticos com vídeo.'
  ];

  return (
    <section className="analytics-workroom" aria-label={`Análises de ${teamName}`}>
      <header className="analytics-command-bar">
        <div>
          <span className="eyebrow">AMISTOSOS · EA SPORTS FC</span>
          <h2>Sala de análise</h2>
          <p>Fatos do payload e hipóteses claramente separadas.</p>
        </div>
        <div className="analytics-sample"><strong>{stats.j}</strong><span>jogos</span></div>
      </header>
      
      <div className="analytics-tabs" role="tablist">
        {tabs.map(([id, l]) => (
          <button type="button" key={id} id={`${uid}-${id}`} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`analytics-tab ${view === id ? 'active' : ''}`}>{l}</button>
        ))}
      </div>
      
      <div role="tabpanel" aria-labelledby={`${uid}-${view}`} className="analytics-view">
        {view === 'summary' && <>
          <div className="analytics-kpi-grid">
            <Kpi l="Aproveitamento" v={`${fmt(stats.rate, 1)}%`} d={`${stats.w}V · ${stats.e}E · ${stats.d}D`} />
            <Kpi l="Gols/jogo" v={stats.gf / stats.j} d={`${stats.gf} marcados`} />
            <Kpi l="Sofridos/jogo" v={stats.ga / stats.j} d={`${stats.ga} sofridos`} />
            <Kpi l="Jogos sem sofrer gol" v={stats.clean} d={`${fmt(stats.clean / stats.j * 100, 1)}%`} />
          </div>
          
          <Sequences games={games} />
          
          <div className="analytics-two-columns">
            <TeamRadarChart stats={stats} />
            <Consistency games={games} />
          </div>
          
          <div className="analytics-two-columns">
            <RatingEvolution games={games.slice(-15)} />
            <Coverage rows={[["Finalizações", stats.shots], ["Tentativas de passe", stats.passAttempts], ["Tentativas de desarme", stats.tackleAttempts], ["Notas", stats.ratings]]} />
          </div>
          
          <Notes notes={insights} />
          <Trend games={games.slice(-10)} />
        </>}
        
        {view === 'attack' && <>
          <Metrics icon={<Target />} title="Produção ofensiva" rows={[["Gols do placar", stats.gf], ["Gols individuais", stats.playerGoals], ["Assistências", stats.assists], ["Finalizações", stats.shots], ["Conversão", stats.conversion == null ? null : `${fmt(stats.conversion, 1)}%`], ["Passes certos", stats.passes], ["Tentativas", stats.passAttempts], ["Precisão", stats.passRate == null ? null : `${fmt(stats.passRate, 1)}%`]]} />
          <div className="analytics-two-columns">
            <GoalsByPosition players={players as Player[]} />
          </div>
          <div className="analytics-two-columns">
            <Ranking title="Artilharia" rows={leaders('goals')} metric="goals" suffix="gols" />
            <Ranking title="Criação" rows={leaders('assists')} metric="assists" suffix="assistências" />
          </div>
        </>}
        
        {view === 'defence' && <>
          <Metrics icon={<Shield />} title="Proteção e goleiros" rows={[["Gols sofridos", stats.ga], ["Jogos sem sofrer", stats.clean], ["Clean sheets (payload)", stats.cleanRaw], ["Goals conceded (payload)", stats.concededRaw], ["Desarmes", stats.tackles], ["Tentativas", stats.tackleAttempts], ["Eficiência", stats.tackleRate == null ? null : `${fmt(stats.tackleRate, 1)}%`], ["Defesas", stats.saves], ["Mergulho", stats.dive], ["Reflexo", stats.reflex], ["Em pé", stats.standing], ["Pênaltis defendidos", stats.penalty], ["Vermelhos", stats.cards]]} />
          <div className="analytics-two-columns">
            <Ranking title="Recuperadores" rows={leaders('tackles')} metric="tackles" suffix="desarmes" />
            <Ranking title="Goleiros" rows={leaders('saves')} metric="saves" suffix="defesas" />
          </div>
        </>}
        
        {view === 'players' && <>
          <Metrics icon={<Users />} title="Cobertura individual" rows={[["Jogadores", players.length], ["Atuações com nota", stats.ratings], ["Nota média", stats.rating], ["Minutos registrados", stats.minutes], ["MVPs", stats.motm]]} />
          <div className="analytics-two-columns">
            <DecisivePlayers players={players as Player[]} />
          </div>
          <div className="analytics-two-columns">
            <Ranking title="Participação" rows={[...players].sort((a, b) => b.goals + b.assists - a.goals - a.assists)} metric="games" suffix="jogos" />
            <Ranking title="Melhores notas" rows={[...players].filter(p => p.rating !== null).sort((a, b) => Number(b.rating) - Number(a.rating))} metric="rating" suffix="nota" />
          </div>
        </>}
        
        {view === 'trends' && <>
          <Period rows={trends} />
          <article className="analytics-panel">
            <h3>Relações descritivas</h3>
            <p>Correlação por partida; associação não prova causa. Exige quatro pares válidos e variação.</p>
            <dl className="correlation-list">
              {relations.map(([l, v]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>{v == null ? <NR /> : `${v > 0 ? '+' : ''}${fmt(v, 2)}`}</dd>
                  <small>{v == null ? 'Amostra insuficiente' : Math.abs(v) >= .7 ? 'forte' : Math.abs(v) >= .4 ? 'moderada' : 'fraca'}</small>
                </div>
              ))}
            </dl>
          </article>
          <Trend games={games.slice(-10)} />
        </>}
        
        {view === 'rivals' && <article className="analytics-panel">
          <label className="analytics-search">
            <span>Buscar rival</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome do rival..." />
          </label>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Rival</th><th>J</th><th>V-E-D</th><th>Gols</th><th>Último</th></tr></thead>
              <tbody>
                {rivals.map(r => (
                  <tr key={r.name}>
                    <th>{r.name}</th>
                    <td>{r.j}</td>
                    <td>{r.w}-{r.e}-{r.d}</td>
                    <td>{r.gf}–{r.ga}</td>
                    <td>{date(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>}
        
        {view === 'assisted' && <article className="analytics-panel assisted-panel">
          <header>
            <div>
              <BrainCircuit />
              <h3>Análise assistida por IA</h3>
            </div>
            {admin && onAnalyzeTeam && (
              <button className="button primary" disabled={busy} onClick={async () => {
                setBusy(true); setError('');
                try { await onAnalyzeTeam(); } catch (e) { setError(e instanceof Error ? e.message : 'A análise não pôde ser concluída.'); } finally { setBusy(false); }
              }}>
                {busy ? 'Analisando…' : aiReport ? 'Atualizar' : 'Gerar relatório'}
              </button>
            )}
          </header>
          <p>A IA deve usar somente este recorte e separar evidência de hipótese.</p>
          {error && <p role="alert" className="error-text">{error}</p>}
          {aiReport ? <div className="ai-markdown assisted-report"><ul>{parseMarkdown(aiReport)}</ul></div> : <p className="analytics-placeholder">O relatório assistido ainda não foi gerado.</p>}
        </article>}
      </div>
    </section>
  );
}

function Kpi({ l, v, d }: { l: string; v: Val; d: string }) {
  return <article className="kpi-card">
    <span>{l}</span>
    <strong>{typeof v === 'number' ? fmt(v, 2) : v ?? <NR />}</strong>
    <small>{d}</small>
  </article>;
}

function Notes({ notes }: { notes: string[] }) {
  return <article className="analytics-panel insight-panel">
    <h3>Leitura automática</h3>
    <ol className="insight-list">
      {notes.map((x, i) => <li key={x}><span>0{i + 1}</span><p>{x}</p></li>)}
    </ol>
  </article>;
}

function Coverage({ rows }: { rows: [string, number | null][] }) {
  return <article className="analytics-panel coverage-panel">
    <h3>Cobertura</h3>
    <p>O traço indica campo ausente no payload.</p>
    <ul>
      {rows.map(([l, v]) => (
        <li key={l}>
          <span>{l}</span>
          <b>{v ?? <NR />}</b>
          <small>{v == null ? 'Não registrado' : 'Registrado'}</small>
        </li>
      ))}
    </ul>
  </article>;
}

function Metrics({ icon, title, rows }: { icon: ReactNode; title: string; rows: [string, Val][] }) {
  return <article className="analytics-panel metric-panel">
    <header>
      <div>{icon}<h3>{title}</h3></div>
      <p>N/R significa campo ausente.</p>
    </header>
    <dl>
      {rows.map(([l, v]) => (
        <div key={l}>
          <dt>{l}</dt>
          <dd>{typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 2) : v ?? <NR />}</dd>
        </div>
      ))}
    </dl>
  </article>;
}

function Ranking({ title, rows, metric, suffix }: { title: string; rows: Player[]; metric: keyof Player; suffix: string }) {
  return <article className="analytics-panel ranking-panel">
    <h3>{title}</h3>
    <ol>
      {rows.slice(0, 7).map((p, i) => (
        <li key={p.id}>
          <span>0{i + 1}</span>
          <div>
            <b>{p.name}</b>
            <small>{p.position}</small>
          </div>
          <strong>{fmt(typeof p[metric] === 'number' ? p[metric] as number : null, metric === 'rating' ? 2 : 0)} {suffix}</strong>
        </li>
      ))}
    </ol>
  </article>;
}

function Trend({ games }: { games: Match[] }) {
  const maxGoals = Math.max(1, ...games.flatMap(m => [m.goalsFor, m.goalsAgainst]));
  
  const getMatchRating = (m: Match) => {
    const ratings = m.players.filter(p => p.own && p.rating !== null).map(p => p.rating as number);
    return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  };
  
  return <article className="analytics-panel trend-panel">
    <header>
      <h3>Sequência recente e Notas</h3>
      <p>Ordem cronológica. Linha indica nota média.</p>
    </header>
    <div className="trend-chart" role="img" aria-label={games.map(m => `${m.opponent}: ${m.goalsFor} a ${m.goalsAgainst}`).join('; ')}>
      <svg className="trend-rating-line" viewBox={`0 0 ${games.length * 50} 100`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
        <path fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" d={games.map((m, i) => {
          const r = getMatchRating(m);
          if (r === null) return '';
          const x = (i * 50) + 25;
          const y = 100 - (Math.max(0, Math.min(10, r)) / 10 * 100);
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).filter(Boolean).join(' ')} />
      </svg>
      {games.map(m => (
        <div className="trend-match" key={m.id} style={{ position: 'relative' }}>
          <div className="trend-bars" style={{ height: '50px' }}>
            <span className="trend-for" style={{ height: `${Math.max(8, m.goalsFor / maxGoals * 100)}%` }} />
            <span className="trend-against" style={{ height: `${Math.max(8, m.goalsAgainst / maxGoals * 100)}%` }} />
          </div>
          <b>{m.goalsFor}–{m.goalsAgainst}</b>
          <small style={{ overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', minHeight: '30px' }}>{m.opponent}</small>
        </div>
      ))}
    </div>
  </article>;
}

function Period({ rows }: { rows: { label: string; j: number; w: number; e: number; d: number; gf: number; ga: number; rate: number }[] }) {
  return <article className="analytics-panel">
    <h3>Evolução por trechos</h3>
    <p>Até três blocos cronológicos de tamanho semelhante.</p>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Trecho</th><th>J</th><th>V-E-D</th><th>Gols</th><th>Aproveitamento</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td>{r.j}</td>
              <td>{r.w}-{r.e}-{r.d}</td>
              <td>{r.gf}–{r.ga}</td>
              <td>{fmt(r.rate, 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </article>;
}

function RatingEvolution({ games }: { games: Match[] }) {
  const data = games.map(m => {
    const ratings = m.players.filter(p => p.own && p.rating !== null).map(p => p.rating as number);
    return { opp: m.opponent, rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null };
  });

  const valid = data.filter(d => d.rating !== null) as { opp: string, rating: number }[];
  if (valid.length < 2) return <article className="analytics-panel rating-evolution-chart"><p>Dados insuficientes para evolução de notas.</p></article>;

  const minRating = Math.max(0, Math.floor(Math.min(...valid.map(d => d.rating)) - 0.5));
  const maxRating = Math.min(10, Math.ceil(Math.max(...valid.map(d => d.rating)) + 0.5));
  
  return <article className="analytics-panel rating-evolution-chart">
    <header>
      <h3>Evolução de Notas</h3>
      <p>Média do time nos últimos {valid.length} jogos registrados.</p>
    </header>
    <div style={{ height: '200px', width: '100%', position: 'relative', marginTop: '1rem' }}>
      <svg viewBox={`0 0 ${valid.length * 50} 100`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <path fill="none" stroke="var(--accent)" strokeWidth="3" d={valid.map((d, i) => {
          const x = (i * 50) + 25;
          const y = 100 - ((d.rating - minRating) / (maxRating - minRating) * 100);
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ')} />
        {valid.map((d, i) => {
          const x = (i * 50) + 25;
          const y = 100 - ((d.rating - minRating) / (maxRating - minRating) * 100);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
              <text x={x} y={y - 8} fontSize="10" fill="var(--text)" textAnchor="middle">{fmt(d.rating, 1)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>
        {valid.map((d, i) => <span key={i} style={{ width: '50px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.opp.substring(0, 4)}</span>)}
      </div>
    </div>
  </article>;
}

function TeamRadarChart({ stats }: { stats: any }) {
  if (stats.j === 0) return null;
  const axes = [
    { label: 'Finalização', val: Math.min(100, (stats.shots / stats.j) * 10) },
    { label: 'Conversão', val: stats.conversion || 0 },
    { label: 'Passes', val: Math.min(100, (stats.passes / stats.j) * 1) },
    { label: 'Precisão', val: stats.passRate || 0 },
    { label: 'Desarmes', val: Math.min(100, (stats.tackles / stats.j) * 5) },
    { label: 'Clean Sheets', val: (stats.clean / stats.j) * 100 }
  ];
  
  const size = 200, center = size / 2, radius = size * 0.4;
  const points = axes.map((a, i) => {
    const angle = (Math.PI / 2) - (2 * Math.PI * i / axes.length);
    const r = radius * (a.val / 100);
    return `${center + r * Math.cos(angle)},${center - r * Math.sin(angle)}`;
  }).join(' ');

  const bgPolygons = [1, 0.75, 0.5, 0.25].map(scale => {
    return axes.map((_, i) => {
      const angle = (Math.PI / 2) - (2 * Math.PI * i / axes.length);
      const r = radius * scale;
      return `${center + r * Math.cos(angle)},${center - r * Math.sin(angle)}`;
    }).join(' ');
  });

  return <article className="analytics-panel team-radar-chart">
    <header><h3>Raio-X da Equipe</h3><p>Valores normalizados (0-100).</p></header>
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {bgPolygons.map((pts, i) => <polygon key={i} points={pts} fill="none" stroke="var(--line)" strokeWidth="1" />)}
        {axes.map((_, i) => {
          const angle = (Math.PI / 2) - (2 * Math.PI * i / axes.length);
          return <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(angle)} y2={center - radius * Math.sin(angle)} stroke="var(--line)" strokeWidth="1" />;
        })}
        <polygon points={points} fill="var(--accent)" fillOpacity="0.3" stroke="var(--accent)" strokeWidth="2" />
        {axes.map((a, i) => {
          const angle = (Math.PI / 2) - (2 * Math.PI * i / axes.length);
          const r = radius * 1.15;
          const x = center + r * Math.cos(angle);
          const y = center - r * Math.sin(angle);
          return <text key={i} x={x} y={y} fontSize="10" fill="var(--text)" textAnchor="middle" dominantBaseline="middle">{a.label}</text>;
        })}
      </svg>
    </div>
  </article>;
}

function GoalsByPosition({ players }: { players: Player[] }) {
  const byPos = { ATA: 0, MEI: 0, DEF: 0, GOL: 0 };
  for (const p of players) {
    if (p.position === 'ATA' || p.position === 'PE' || p.position === 'PD' || p.position === 'SA' || p.position === 'CA') byPos.ATA += p.goals;
    else if (p.position === 'MEI' || p.position === 'MC' || p.position === 'ME' || p.position === 'MD' || p.position === 'MEI' || p.position === 'VOL') byPos.MEI += p.goals;
    else if (p.position === 'ZAG' || p.position === 'LE' || p.position === 'LD' || p.position === 'ADD' || p.position === 'ADE') byPos.DEF += p.goals;
    else if (p.position === 'GOL') byPos.GOL += p.goals;
    else byPos.ATA += p.goals; // fallback
  }
  
  const total = Object.values(byPos).reduce((a, b) => a + b, 0);
  if (!total) return null;

  return <article className="analytics-panel goals-by-position">
    <header><h3>Gols por Posição</h3><p>Distribuição de {total} gols marcados.</p></header>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
      {Object.entries(byPos).map(([pos, g]) => (
        <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '40px', fontSize: '12px', fontWeight: 'bold' }}>{pos}</span>
          <div style={{ flex: 1, height: '24px', background: 'var(--panel-alt)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(g / total) * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <span style={{ width: '30px', textAlign: 'right', fontSize: '14px' }}>{g}</span>
        </div>
      ))}
    </div>
  </article>;
}

function Sequences({ games }: { games: Match[] }) {
  let curInv = 0, maxInv = 0;
  let curWin = 0, maxWin = 0;
  let curWinless = 0, maxWinless = 0;

  for (const m of games) {
    const r = result(m);
    if (r === 'V' || r === 'E') { curInv++; maxInv = Math.max(maxInv, curInv); } else { curInv = 0; }
    if (r === 'V') { curWin++; maxWin = Math.max(maxWin, curWin); } else { curWin = 0; }
    if (r === 'D' || r === 'E') { curWinless++; maxWinless = Math.max(maxWinless, curWinless); } else { curWinless = 0; }
  }

  return <div className="analytics-kpi-grid sequence-cards">
    <Kpi l="Maior Invencibilidade" v={maxInv} d={maxInv === 1 ? 'jogo' : 'jogos'} />
    <Kpi l="Vitórias Seguidas" v={maxWin} d={maxWin === 1 ? 'jogo' : 'jogos'} />
    <Kpi l="Pior Jejum" v={maxWinless} d={`${maxWinless} sem vencer`} />
  </div>;
}

function Consistency({ games }: { games: Match[] }) {
  const ratings = games.map(m => {
    const rs = m.players.filter(p => p.own && p.rating !== null).map(p => p.rating as number);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  }).filter((r): r is number => r !== null);

  if (ratings.length < 3) return null;

  const std = stdDev(ratings);
  const status = std < 0.5 ? 'Equipe consistente' : std > 1.0 ? 'Equipe irregular' : 'Moderadamente consistente';

  return <article className="analytics-panel consistency-card">
    <header>
      <div><Activity /><h3>Análise de Consistência</h3></div>
      <p>Baseado no desvio padrão das notas médias da equipe.</p>
    </header>
    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
      <strong style={{ fontSize: '24px', color: 'var(--text)' }}>{status}</strong>
      <p style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>Variação de ±{fmt(std, 2)} pontos por jogo</p>
    </div>
  </article>;
}

function DecisivePlayers({ players }: { players: Player[] }) {
  const dec = players.filter(p => p.games > 0)
    .map(p => ({ ...p, ga: p.goals + p.assists, perGame: (p.goals + p.assists) / p.games }))
    .sort((a, b) => b.perGame - a.perGame)
    .slice(0, 5);

  if (!dec.length) return null;

  return <article className="analytics-panel decisive-players">
    <h3>Jogadores Decisivos</h3>
    <p>Gols + Assistências por partida disputada.</p>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Jogador</th><th>Pos</th><th>G+A/J</th><th>G+A</th><th>Jogos</th></tr></thead>
        <tbody>
          {dec.map(p => (
            <tr key={p.id}>
              <th>{p.name}</th>
              <td>{p.position}</td>
              <td><strong>{fmt(p.perGame, 2)}</strong></td>
              <td>{p.ga}</td>
              <td>{p.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </article>;
}
