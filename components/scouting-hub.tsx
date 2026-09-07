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
} from 'lucide-react';
import type { Match, RecordItem, TeamId } from '@/lib/domain';
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
  const dossier = (
    (selected?.report?.data.matches as Match[] | undefined) ??
    selected?.matches ??
    []
  ).filter(
    (match): match is Match => Boolean(match) && match.type === 'friendlyMatch',
  );
  const players = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of dossier)
      for (const p of m.players || []) {
        if (p.own) continue;
        const x = map.get(p.id) ?? {
          id: p.id,
          name: p.name,
          position: p.position,
          games: 0,
          goals: 0,
          assists: 0,
          sum: 0,
          ratings: 0,
        };
        x.games++;
        x.goals += p.goals ?? 0;
        x.assists += p.assists ?? 0;
        if (p.rating != null) {
          x.sum += p.rating;
          x.ratings++;
        }
        map.set(p.id, x);
      }
    return [...map.values()].sort(
      (a, b) => b.games - a.games || b.goals - a.goals,
    );
  }, [dossier]);
  const lines = dossier.reduce(
    (n, m) => n + (m.players || []).filter((p) => !p.own).length,
    0,
  );
  const rated = dossier.reduce(
    (n, m) =>
      n + (m.players || []).filter((p) => !p.own && p.rating != null).length,
    0,
  );
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
            Busque clubes na EA ou consulte rivais enfrentados em amistosos.
            Todo o dossiê usa exclusivamente partidas amistosas.
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
              A coleta usa exclusivamente até 20 amistosos
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
                onClick={() => setSelectedKey(r.key)}
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
        <section className="panel">
          {selected ? (
            <>
              <header>
                <div>
                  <h2>{selected.name}</h2>
                  <small>
                    {selected.clubId
                      ? `ID EA ${selected.clubId}`
                      : 'Identificado no histórico de amistosos'}
                  </small>
                </div>
                {admin && selected.report && (
                  <button
                    className="icon-button"
                    aria-label={`Excluir dossiê de ${selected.name}`}
                    onClick={() => void onRemoveRecord(selected.report!)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </header>
              <div className="metrics">
                <div className="metric">
                  <span>Amostra</span>
                  <strong>{dossier.length}</strong>
                  <small>amistosos</small>
                </div>
                <div className="metric">
                  <span>Gols na amostra</span>
                  <strong>
                    {dossier.reduce((n, m) => n + m.goalsFor, 0)} :{' '}
                    {dossier.reduce((n, m) => n + m.goalsAgainst, 0)}
                  </strong>
                  <small>marcados : sofridos</small>
                </div>
                <div className="metric">
                  <span>Cobertura individual</span>
                  <strong>
                    {lines ? Math.round((rated / lines) * 100) : 0}%
                  </strong>
                  <small>
                    {rated} de {lines} atuações com nota
                  </small>
                </div>
              </div>
              {selected.matches.length > 0 && (
                <div className="form-strip">
                  <span>CONTRA NÓS</span>
                  <b>{selected.wins}V</b>
                  <b>{selected.draws}E</b>
                  <b>{selected.losses}D</b>
                  <small>
                    {selected.gf}:{selected.ga} no agregado
                  </small>
                </div>
              )}
              {selected.report?.data.aiAnalysis &&
                selected.report.data.aiScope === 'friendlyMatch' && (
                  <div className="ai-analysis-pro">
                    <div className="ai-header">
                      <Shield size={16} />
                      <b>Leitura assistida desta amostra</b>
                    </div>
                    <p>{selected.report.data.aiAnalysis}</p>
                  </div>
                )}
              {admin &&
                selected.report &&
                (!selected.report.data.aiAnalysis ||
                  selected.report.data.aiScope !== 'friendlyMatch') && (
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
                  >
                    {busy === 'ai' ? 'Analisando…' : 'Gerar leitura assistida'}
                  </button>
                )}
              <div className="section-title-bar">
                <div>
                  <h3>Jogadores identificados</h3>
                  <p>Somente dados fornecidos nos amistosos da amostra.</p>
                </div>
              </div>
              {players.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Jogador</th>
                        <th>Posição</th>
                        <th>Jogos</th>
                        <th>Gols</th>
                        <th>Assist.</th>
                        <th>Nota média</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.slice(0, 20).map((p) => (
                        <tr key={p.id}>
                          <td>
                            <b>{p.name}</b>
                          </td>
                          <td>{p.position || '—'}</td>
                          <td>{p.games}</td>
                          <td>{p.goals}</td>
                          <td>{p.assists}</td>
                          <td>
                            {p.ratings
                              ? (p.sum / p.ratings).toLocaleString('pt-BR', {
                                  maximumFractionDigits: 1,
                                })
                              : 'Sem dado'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <Users size={24} />
                  <h3>Sem dados individuais</h3>
                  <p>A fonte não forneceu jogadores nesta amostra.</p>
                </div>
              )}
              <div className="section-title-bar">
                <div>
                  <h3>Últimos amistosos</h3>
                  <p>
                    Somente amistosos da fonte, sem inferir formação ou
                    movimentação.
                  </p>
                </div>
              </div>
              {dossier.slice(0, 10).map((m) => (
                <div className="list-row" key={m.id}>
                  <span>{date(m.playedAt)}</span>
                  <b>vs {m.opponent}</b>
                  <strong>
                    {m.goalsFor} × {m.goalsAgainst}
                  </strong>
                </div>
              ))}
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
