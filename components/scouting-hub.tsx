'use client';
/* oxlint-disable typescript/no-explicit-any, react/react-compiler -- External EA payloads and JSON records are runtime-shaped. */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  LoaderCircle,
  Search,
  Shield,
  Trash2,
  Users,
  Flame,
} from 'lucide-react';
import type { Match, RecordItem, TeamId } from '@/lib/domain';
import { result as domainResult } from '@/lib/domain';

type AppRecord = RecordItem<Record<string, any>>;

type Props = {
  matches: Match[];
  records: AppRecord[];
  admin: boolean;
  team: TeamId;
  onAnalyze: (id: string) => Promise<void>;
  onCreateReport: (v: any) => Promise<void>;
  onSaveOpponentLogo?: (name: string, url: string) => Promise<void>;
  onRemoveRecord: (r: AppRecord) => Promise<void>;
};

type Rival = {
  key: string;
  name: string;
  clubId?: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  lastMatch: string;
  matches: Match[];
  report?: AppRecord;
};

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
const date = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

function matchRes(m: Match, isPerspectiveOwn: boolean) {
  if (isPerspectiveOwn) return domainResult(m);
  const r = domainResult(m);
  return r === 'V' ? 'D' : r === 'D' ? 'V' : 'E';
}

function computeStats(matches: Match[], isPerspectiveOwn: boolean) {
  let games = 0;
  let gf = 0;
  let ga = 0;
  let cleanSheets = 0;
  let shots = 0;
  let passAttempts = 0;
  let passes = 0;
  let tackles = 0;
  let ratingSum = 0;
  let ratingsCount = 0;

  for (const m of matches) {
    if (m.excluded) continue;
    games++;
    const tGf = isPerspectiveOwn ? m.goalsFor : m.goalsAgainst;
    const tGa = isPerspectiveOwn ? m.goalsAgainst : m.goalsFor;
    gf += tGf;
    ga += tGa;
    if (tGa === 0) cleanSheets++;

    for (const p of m.players || []) {
      if (isPerspectiveOwn ? p.own : !p.own) {
        shots += p.shots ?? 0;
        passAttempts += p.passAttempts ?? 0;
        passes += p.passes ?? 0;
        tackles += p.tackles ?? 0;
        if (p.rating != null) {
          ratingSum += p.rating;
          ratingsCount++;
        }
      }
    }
  }

  return {
    games,
    gf,
    ga,
    cleanSheets,
    shots,
    passAttempts,
    passes,
    tackles,
    gfPerGame: games ? gf / games : 0,
    gaPerGame: games ? ga / games : 0,
    cleanSheetPct: games ? (cleanSheets / games) * 100 : 0,
    shotsPerGame: games ? shots / games : 0,
    passAttemptsPerGame: games ? passAttempts / games : 0,
    passAccuracy: passAttempts ? (passes / passAttempts) * 100 : 0,
    tacklesPerGame: games ? tackles / games : 0,
    avgRating: ratingsCount ? ratingSum / ratingsCount : 0,
  };
}

function ComparisonRow({
  label,
  them,
  us,
  format,
}: {
  label: string;
  them: number;
  us: number;
  format: (v: number) => string;
}) {
  const max = Math.max(them, us, 0.0001);
  const themPct = them > 0 ? Math.min(100, Math.round((them / max) * 100)) : 0;
  const usPct = us > 0 ? Math.min(100, Math.round((us / max) * 100)) : 0;
  const themStr = them > 0 ? format(them) : 'N/R';
  const usStr = us > 0 ? format(us) : 'N/R';

  return (
    <div className="dossier-compare-row">
      <div className="dossier-compare-header">
        <div className="dossier-compare-label">
          <span>{label}</span>
        </div>
        <div className="dossier-compare-values">
          <div className="dossier-val dossier-val-them" title={`Adversário: ${themStr}`}>
            <span className="dossier-val-dot dossier-dot-them"></span>
            <span className="dossier-val-name">Eles</span>
            <b>{themStr}</b>
          </div>
          <div className="dossier-val dossier-val-us" title={`Nossa equipe: ${usStr}`}>
            <span className="dossier-val-dot dossier-dot-us"></span>
            <span className="dossier-val-name">Nós</span>
            <b>{usStr}</b>
          </div>
        </div>
      </div>
      <div className="dossier-compare-bars">
        <div className="dossier-bar-track dossier-bar-them" title={`Adversário: ${themStr}`}>
          <div
            className="dossier-bar-fill"
            style={{ width: `${themPct}%` }}
          />
        </div>
        <div className="dossier-bar-track dossier-bar-us" title={`Nossa equipe: ${usStr}`}>
          <div
            className="dossier-bar-fill dossier-bar-fill-us"
            style={{ width: `${usPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ScoutingHub({
  matches,
  records,
  admin,
  team,
  onAnalyze,
  onCreateReport,
  onRemoveRecord,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'resumo' | 'elenco' | 'amistosos' | 'confronto'>('resumo');

  const reports = useMemo(
    () => records.filter((r) => r.kind === 'scout'),
    [records],
  );

  const rivals = useMemo(() => {
    const map = new Map<string, Rival>();
    for (const m of matches) {
      if (m.excluded || m.type !== 'friendlyMatch' || !m.opponent) continue;
      const key = norm(m.opponent);
      const r = map.get(key) ?? {
        key,
        name: m.opponent,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        lastMatch: m.playedAt,
        matches: [],
      };
      r.games++;
      r.gf += m.goalsFor;
      r.ga += m.goalsAgainst;
      r.matches.push(m);
      if (m.goalsFor > m.goalsAgainst) r.wins++;
      else if (m.goalsFor === m.goalsAgainst) r.draws++;
      else r.losses++;
      if (m.playedAt > r.lastMatch) r.lastMatch = m.playedAt;
      map.set(key, r);
    }
    for (const report of reports) {
      const existing = [...map.values()].find(
        (r) => norm(r.name) === norm(report.data.name || ''),
      );
      if (existing) {
        existing.report = report;
        existing.clubId = String(report.data.clubId || '');
      } else {
        const key = `ea:${report.data.clubId || report.id}`;
        map.set(key, {
          key,
          name: report.data.name || `Clube ${report.data.clubId}`,
          clubId: String(report.data.clubId || ''),
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          gf: 0,
          ga: 0,
          lastMatch: report.createdAt,
          matches: [],
          report,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      b.lastMatch.localeCompare(a.lastMatch),
    );
  }, [matches, reports]);

  const filtered = rivals.filter((r) => norm(r.name).includes(norm(query)));
  const selected = rivals.find((r) => r.key === selectedKey) ?? filtered[0];

  const dossier = useMemo(() => (
    (selected?.report?.data.matches as Match[] | undefined) ??
    selected?.matches ??
    []
  ).filter(
    (match): match is Match => Boolean(match) && match.type === 'friendlyMatch',
  ), [selected]);

  const isTargetReport = !!selected?.report;

  const ourFriendlyMatches = useMemo(
    () => matches.filter((m) => !m.excluded && m.type === 'friendlyMatch'),
    [matches]
  );
  const usStats = useMemo(() => computeStats(ourFriendlyMatches, true), [ourFriendlyMatches]);
  const themStats = useMemo(() => computeStats(dossier, isTargetReport), [dossier, isTargetReport]);

  const players = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of dossier) {
      for (const p of m.players || []) {
        const belongsToTarget = selected?.report ? p.own : !p.own;
        if (!belongsToTarget) continue;
        const x = map.get(p.id) ?? {
          id: p.id,
          name: p.name,
          position: p.position,
          games: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          tackles: 0,
          passes: 0,
          passAttempts: 0,
          seconds: 0,
          sum: 0,
          ratings: 0,
        };
        x.games++;
        x.goals += p.goals ?? 0;
        x.assists += p.assists ?? 0;
        x.shots += p.shots ?? 0;
        x.tackles += p.tackles ?? 0;
        x.passes += p.passes ?? 0;
        x.passAttempts += p.passAttempts ?? 0;
        x.seconds += p.seconds ?? 0;
        if (p.rating != null) {
          x.sum += p.rating;
          x.ratings++;
        }
        map.set(p.id, x);
      }
    }
    return [...map.values()].sort((a, b) => {
      const dangerB = (b.goals + b.assists) / Math.max(1, b.games);
      const dangerA = (a.goals + a.assists) / Math.max(1, a.games);
      if (dangerB !== dangerA) return dangerB - dangerA;
      const ratingB = b.ratings ? b.sum / b.ratings : -1;
      const ratingA = a.ratings ? a.sum / a.ratings : -1;
      return ratingB - ratingA;
    });
  }, [dossier, selected?.report]);

  const topH2hScorer = useMemo(() => {
    if (!selected || selected.matches.length === 0) return null;
    const h2hPlayers = new Map<string, { name: string; goals: number }>();
    for (const m of selected.matches) {
      for (const p of m.players || []) {
        if (p.own && p.goals && p.goals > 0) {
          const ex = h2hPlayers.get(p.id) || { name: p.name, goals: 0 };
          ex.goals += p.goals;
          h2hPlayers.set(p.id, ex);
        }
      }
    }
    return [...h2hPlayers.values()].sort((a, b) => b.goals - a.goals)[0];
  }, [selected]);

  async function searchEA() {
    if (query.trim().length < 3) {
      setError('Digite pelo menos 3 letras.');
      return;
    }
    setBusy('search');
    setError('');
    try {
      const r = await fetch(`/api/${team}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: query.trim() }),
      });
      const b: any = await r.json();
      if (!r.ok) throw new Error(b.error || 'Busca indisponível.');
      const rows = Array.isArray(b)
        ? b
        : Object.entries(b || {}).map(([id, value]) => ({
            ...(value && typeof value === 'object' ? value : {}),
            clubId: (value as any)?.clubId ?? id,
          }));
      setResults(rows);
      if (!rows.length) setError('Nenhum clube encontrado pela EA.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function create(item: any) {
    const clubId = String(item.clubId ?? item.clubid ?? item.id ?? '');
    const name = String(
      item.name ?? item.clubName ?? item.clubname ?? `Clube ${clubId}`,
    );
    if (!/^\d+$/.test(clubId)) {
      setError('A fonte não retornou um ID válido.');
      return;
    }
    setBusy(clubId);
    try {
      await onCreateReport({ name, clubId });
      setResults([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="scouting-container">
      <div className="scouting-header-box">
        <div className="scouting-title-wrap">
          <h2>Diretório de adversários</h2>
          <p>
            Busque clubes na EA ou consulte rivais enfrentados em amistosos. Todo o dossiê usa exclusivamente partidas amistosas.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Buscar adversário"
            placeholder="Nome do clube adversário"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void searchEA();
            }}
          />
        </label>
        <button
          className="button primary"
          disabled={busy === 'search' || query.trim().length < 3}
          onClick={() => void searchEA()}
        >
          {busy === 'search' ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Search size={16} />
          )}
          Buscar na EA
        </button>
      </div>

      {error && (
        <p className="error-text" role="alert">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      {results.length > 0 && (
        <section className="panel">
          <header>
            <h2>Resultados da EA</h2>
            <span className="muted">
              A coleta solicita até 100 amistosos, limitada ao máximo retornado pela EA
            </span>
          </header>
          {results.map((x: any, i: number) => {
            const id = String(x.clubId ?? x.clubid ?? x.id ?? '');
            const name = String(
              x.name ?? x.clubName ?? x.clubname ?? `Resultado ${i + 1}`,
            );
            return (
              <div className="list-row" key={id || i}>
                <div>
                  <b>{name}</b>
                  <small>{id ? `ID EA ${id}` : 'ID indisponível'}</small>
                </div>
                {admin && (
                  <button
                    className="button"
                    disabled={!id || busy === id}
                    onClick={() => void create(x)}
                  >
                    {busy === id ? 'Coletando…' : 'Criar dossiê'}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="overview-grid">
        <aside className="panel">
          <header>
            <h2>Base de clubes</h2>
            <span className="muted">{filtered.length}</span>
          </header>
          {filtered.length ? (
            filtered.map((r) => (
              <button
                className={`match-row ${selected?.key === r.key ? 'active' : ''}`}
                key={r.key}
                onClick={() => {
                  setSelectedKey(r.key);
                  setTab('resumo');
                }}
              >
                <span className="player-avatar">
                  {r.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="match-opponent">
                  <b>{r.name}</b>
                  <small>
                    {r.report
                      ? 'Dossiê EA disponível'
                      : `${r.games} confronto(s) conosco`}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <div className="empty">
              <Search size={24} />
              <h3>Nenhum clube encontrado</h3>
              <p>Refine a busca ou sincronize amistosos.</p>
            </div>
          )}
        </aside>

        <section className="panel opponent-panel">
          {selected ? (
            <>
              <div className="dossier-header" style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
                <div className="dossier-avatar" style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--panel)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold' }}>
                  {selected.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="dossier-title" style={{ flex: 1 }}>
                  <div className="title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>{selected.name}</h2>
                    {admin && selected.report && (
                      <button
                        className="icon-button"
                        aria-label={`Excluir dossiê de ${selected.name}`}
                        onClick={() => void onRemoveRecord(selected.report!)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="dossier-meta muted" style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                    {selected.clubId ? `ID EA: ${selected.clubId}` : 'Histórico de amistosos'}
                    <span style={{ margin: '0 8px' }}>•</span>
                    {themStats.games} partidas na amostra
                  </div>
                </div>
              </div>

              <div className="dossier-quick-stats" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                <div className="stat" style={{ flex: 1, padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Gols/jogo</span>
                  <strong style={{ fontSize: '1.25rem' }}>{themStats.gfPerGame.toFixed(1)}</strong>
                </div>
                <div className="stat" style={{ flex: 1, padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Sofridos/jogo</span>
                  <strong style={{ fontSize: '1.25rem' }}>{themStats.gaPerGame.toFixed(1)}</strong>
                </div>
                <div className="stat" style={{ flex: 1, padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Rating médio</span>
                  <strong style={{ fontSize: '1.25rem' }}>{themStats.avgRating ? themStats.avgRating.toFixed(1) : 'N/R'}</strong>
                </div>
              </div>

              <div className="dossier-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', marginBottom: '24px', overflowX: 'auto' }}>
                {['resumo', 'elenco', 'amistosos', ...(selected.matches.length > 0 ? ['confronto'] : [])].map(t => (
                  <button
                    key={t}
                    className={`dossier-tab ${tab === t ? 'active' : ''}`}
                    onClick={() => setTab(t as any)}
                    style={{
                      padding: '8px 16px',
                      background: 'none',
                      border: 'none',
                      borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                      color: tab === t ? 'var(--text)' : 'var(--muted)',
                      fontWeight: tab === t ? 'bold' : 'normal',
                      cursor: 'pointer'
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {tab === 'resumo' && (
                <div className="tab-content resumo">
                  <div className="dossier-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '32px' }}>
                    <div className="metric" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '4px' }}>Amostra</span>
                      <strong style={{ display: 'block', fontSize: '1.5rem', marginBottom: '2px' }}>{themStats.games}</strong>
                      <small style={{ color: 'var(--muted)' }}>amistosos</small>
                    </div>
                    <div className="metric" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '4px' }}>Gols marcados</span>
                      <strong style={{ display: 'block', fontSize: '1.5rem', marginBottom: '2px' }}>{themStats.gfPerGame.toFixed(1)}</strong>
                      <small style={{ color: 'var(--muted)' }}>por jogo</small>
                    </div>
                    <div className="metric" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '4px' }}>Gols sofridos</span>
                      <strong style={{ display: 'block', fontSize: '1.5rem', marginBottom: '2px' }}>{themStats.gaPerGame.toFixed(1)}</strong>
                      <small style={{ color: 'var(--muted)' }}>por jogo</small>
                    </div>
                    <div className="metric" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '4px' }}>Clean sheets</span>
                      <strong style={{ display: 'block', fontSize: '1.5rem', marginBottom: '2px' }}>{themStats.cleanSheetPct.toFixed(0)}%</strong>
                      <small style={{ color: 'var(--muted)' }}>sem sofrer gol</small>
                    </div>
                  </div>

                  <div className="play-style-section" style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0 }}>Como eles jogam</h3>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--text)' }}></span> Eles</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--accent)' }}></span> Nós</div>
                      </div>
                    </div>
                    
                    <div className="play-style-bars" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <ComparisonRow label="Finalizações/jogo" them={themStats.shotsPerGame} us={usStats.shotsPerGame} format={(v) => v.toFixed(1)} />
                      <ComparisonRow label="Passes tentados/jogo" them={themStats.passAttemptsPerGame} us={usStats.passAttemptsPerGame} format={(v) => v.toFixed(0)} />
                      <ComparisonRow label="Precisão de passe" them={themStats.passAccuracy} us={usStats.passAccuracy} format={(v) => v.toFixed(0) + '%'} />
                      <ComparisonRow label="Desarmes/jogo" them={themStats.tacklesPerGame} us={usStats.tacklesPerGame} format={(v) => v.toFixed(1)} />
                      <ComparisonRow label="Rating médio" them={themStats.avgRating} us={usStats.avgRating} format={(v) => v.toFixed(1)} />
                    </div>
                  </div>

                  <div className="recent-form-section" style={{ marginBottom: '32px' }}>
                    <h3 style={{ marginBottom: '16px' }}>Forma recente</h3>
                    <div className="form-bubbles" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[...dossier].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 8).reverse().map(m => {
                        const res = matchRes(m, isTargetReport);
                        const color = res === 'V' ? '#22c55e' : res === 'D' ? '#ef4444' : '#64748b';
                        return (
                          <span key={m.id} className={`form-bubble ${res}`} title={date(m.playedAt)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {res}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {selected.report?.data.aiAnalysis && selected.report.data.aiScope === 'friendlyMatch' && (
                    <div className="ai-analysis-pro" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                      <div className="ai-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--accent)' }}>
                        <Shield size={16} />
                        <b>Leitura assistida desta amostra</b>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{selected.report.data.aiAnalysis}</p>
                    </div>
                  )}

                  {admin && selected.report && (!selected.report.data.aiAnalysis || selected.report.data.aiScope !== 'friendlyMatch') && (
                    <button
                      className="button"
                      disabled={busy === 'ai'}
                      onClick={async () => {
                        setBusy('ai');
                        try {
                          await onAnalyze(selected.report!.id);
                        } finally {
                          setBusy('');
                        }
                      }}
                      style={{ marginTop: '16px' }}
                    >
                      {busy === 'ai' ? 'Analisando…' : 'Gerar leitura assistida'}
                    </button>
                  )}
                </div>
              )}

              {tab === 'elenco' && (
                <div className="tab-content elenco">
                  {players.length > 0 ? (
                    <>
                      <h3 style={{ marginBottom: '16px' }}>Jogadores Mais Perigosos</h3>
                      <div className="danger-players" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        {players.slice(0, 5).map((p, i) => (
                          <div key={p.id} className="danger-card" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }}>
                            <div className="danger-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                              <div className="danger-name" style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '70%' }}>
                                {i < 3 && <Flame size={16} style={{ color: '#ef4444', flexShrink: 0 }} />}
                                <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
                              </div>
                              <div className="danger-badges" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                {p.position && <span className="pos-badge" style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--line)', borderRadius: '4px' }}>{p.position}</span>}
                                <span className="rating-badge" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{p.ratings ? (p.sum / p.ratings).toFixed(1) : 'N/R'}</span>
                              </div>
                            </div>
                            <div className="danger-stats-bar" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                              <div className="stat-sm" style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>G+A</span>
                                <strong>{p.goals + p.assists}</strong>
                              </div>
                              <div className="stat-sm" style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Jogos</span>
                                <strong>{p.games}</strong>
                              </div>
                              <div className="stat-sm" style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>G+A/jogo</span>
                                <strong>{((p.goals + p.assists) / Math.max(1, p.games)).toFixed(2)}</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <h3 style={{ marginBottom: '16px' }}>Elenco Completo</h3>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Jogador</th>
                              <th>Pos</th>
                              <th>Jogos</th>
                              <th>Gols</th>
                              <th>Ast</th>
                              <th>Chutes</th>
                              <th>Rating</th>
                            </tr>
                          </thead>
                          <tbody>
                            {players.map(p => (
                              <tr key={p.id}>
                                <td><b>{p.name}</b></td>
                                <td>{p.position || 'N/R'}</td>
                                <td>{p.games}</td>
                                <td>{p.goals}</td>
                                <td>{p.assists}</td>
                                <td>{p.shots}</td>
                                <td>{p.ratings ? (p.sum / p.ratings).toFixed(1) : 'N/R'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <Users size={24} />
                      <h3>Sem dados individuais</h3>
                      <p>A fonte não forneceu jogadores nesta amostra.</p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'amistosos' && (
                <div className="tab-content amistosos">
                  <div className="dossier-metrics mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                    <div className="metric" style={{ padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Jogos</span>
                      <strong style={{ fontSize: '1.25rem' }}>{themStats.games}</strong>
                    </div>
                    <div className="metric" style={{ padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Vitórias</span>
                      <strong style={{ fontSize: '1.25rem', color: '#22c55e' }}>{dossier.filter(m => matchRes(m, isTargetReport) === 'V').length}</strong>
                    </div>
                    <div className="metric" style={{ padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Empates</span>
                      <strong style={{ fontSize: '1.25rem', color: '#64748b' }}>{dossier.filter(m => matchRes(m, isTargetReport) === 'E').length}</strong>
                    </div>
                    <div className="metric" style={{ padding: '12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>Derrotas</span>
                      <strong style={{ fontSize: '1.25rem', color: '#ef4444' }}>{dossier.filter(m => matchRes(m, isTargetReport) === 'D').length}</strong>
                    </div>
                  </div>

                  <div className="matches-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {dossier.map(m => {
                      const res = matchRes(m, isTargetReport);
                      const tgGf = isTargetReport ? m.goalsFor : m.goalsAgainst;
                      const tgGa = isTargetReport ? m.goalsAgainst : m.goalsFor;
                      const targetPlayers = (m.players || []).filter(p => isTargetReport ? p.own : !p.own);
                      const topPerformer = [...targetPlayers].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
                      const scorers = targetPlayers.filter(p => p.goals && p.goals > 0);
                      const color = res === 'V' ? '#22c55e' : res === 'D' ? '#ef4444' : '#64748b';

                      return (
                        <div key={m.id} className="match-card-mini" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                          <div className="match-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span className="date" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{date(m.playedAt)}</span>
                            <span className={`result-badge ${res}`} style={{ padding: '2px 8px', borderRadius: '4px', background: color, color: '#fff', fontSize: '0.75rem', fontWeight: 'bold' }}>{res}</span>
                          </div>
                          <div className="match-score" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: topPerformer || scorers.length ? '1px solid var(--line)' : 'none' }}>
                            <span style={{ flex: 1, textAlign: 'right' }}>{isTargetReport ? selected.name : 'Eles'}</span>
                            <strong style={{ padding: '0 16px', fontSize: '1.25rem' }}>{tgGf} × {tgGa}</strong>
                            <span style={{ flex: 1, color: 'var(--muted)' }}>{m.opponent || 'Adversário'}</span>
                          </div>
                          {(topPerformer || scorers.length > 0) && (
                            <div className="match-highlights" style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {scorers.length > 0 && (
                                <div className="highlight-row">
                                  <span className="hl-label" style={{ color: 'var(--muted)', marginRight: '8px' }}>Gols:</span>
                                  <span className="hl-val">{scorers.map(s => `${s.name} (${s.goals})`).join(', ')}</span>
                                </div>
                              )}
                              {topPerformer && topPerformer.rating != null && (
                                <div className="highlight-row">
                                  <span className="hl-label" style={{ color: 'var(--muted)', marginRight: '8px' }}>Melhor em campo:</span>
                                  <span className="hl-val">{topPerformer.name} ({topPerformer.rating.toFixed(1)})</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'confronto' && selected.matches.length > 0 && (
                <div className="tab-content confronto">
                  <div className="h2h-section" style={{ padding: '24px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '24px', textAlign: 'center' }}>
                    <div className="h2h-record" style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'center', gap: '16px' }}>
                      <span className="h2h-v" style={{ color: '#22c55e' }}>{selected.wins}V</span>
                      <span className="h2h-e" style={{ color: '#64748b' }}>{selected.draws}E</span>
                      <span className="h2h-d" style={{ color: '#ef4444' }}>{selected.losses}D</span>
                    </div>
                    <div className="h2h-aggregate" style={{ fontSize: '1.1rem', marginBottom: '24px' }}>
                      Agregado: Nós <strong>{selected.gf} × {selected.ga}</strong> {selected.name}
                    </div>
                    <div className="h2h-extremes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', textAlign: 'left' }}>
                      <div className="extreme-card" style={{ padding: '12px', background: 'var(--bg)', borderRadius: '6px' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Nossa maior vitória</span>
                        <strong style={{ fontSize: '1.1rem' }}>
                          {selected.matches.filter(m => m.goalsFor > m.goalsAgainst).length > 0
                            ? (() => {
                                const m = selected.matches.filter(match => match.goalsFor > match.goalsAgainst).sort((a, b) => (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))[0];
                                return `${m.goalsFor} × ${m.goalsAgainst}`;
                              })()
                            : 'N/R'}
                        </strong>
                      </div>
                      <div className="extreme-card" style={{ padding: '12px', background: 'var(--bg)', borderRadius: '6px' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Maior derrota</span>
                        <strong style={{ fontSize: '1.1rem' }}>
                          {selected.matches.filter(m => m.goalsFor < m.goalsAgainst).length > 0
                            ? (() => {
                                const m = selected.matches.filter(match => match.goalsFor < match.goalsAgainst).sort((a, b) => (b.goalsAgainst - b.goalsFor) - (a.goalsAgainst - a.goalsFor))[0];
                                return `${m.goalsFor} × ${m.goalsAgainst}`;
                              })()
                            : 'N/R'}
                        </strong>
                      </div>
                      <div className="extreme-card" style={{ padding: '12px', background: 'var(--bg)', borderRadius: '6px' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>Artilheiro do confronto</span>
                        <strong style={{ fontSize: '1.1rem' }}>{topH2hScorer ? `${topH2hScorer.name} (${topH2hScorer.goals})` : 'N/R'}</strong>
                      </div>
                    </div>
                  </div>

                  <h3 style={{ marginBottom: '16px' }}>Histórico de Confrontos</h3>
                  <div className="matches-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selected.matches.map(m => {
                      const res = matchRes(m, true);
                      const color = res === 'V' ? '#22c55e' : res === 'D' ? '#ef4444' : '#64748b';
                      return (
                        <div key={m.id} className="match-card-mini" style={{ padding: '16px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                          <div className="match-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span className="date" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{date(m.playedAt)}</span>
                            <span className={`result-badge ${res}`} style={{ padding: '2px 8px', borderRadius: '4px', background: color, color: '#fff', fontSize: '0.75rem', fontWeight: 'bold' }}>{res}</span>
                          </div>
                          <div className="match-score" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ flex: 1, textAlign: 'right' }}>Nós</span>
                            <strong style={{ padding: '0 16px', fontSize: '1.25rem' }}>{m.goalsFor} × {m.goalsAgainst}</strong>
                            <span style={{ flex: 1, color: 'var(--muted)' }}>{selected.name}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <Shield size={24} />
              <h3>Selecione um clube</h3>
              <p>O dossiê aparecerá aqui.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
