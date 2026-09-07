'use client';
/* oxlint-disable typescript/no-explicit-any, next/no-img-element, jsx-a11y/prefer-tag-over-role -- EA rows and persisted records are schemaless; private image URLs cannot use the static image loader. */
import { useMemo, useState } from 'react';
import {
  Camera,
  ChevronRight,
  ClipboardCheck,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { Match, RecordItem } from '@/lib/domain';

type AppRecord = RecordItem<Record<string, any>>;
type Props = {
  matches: Match[];
  records: AppRecord[];
  admin: boolean;
  saveRecord: (kind: string, data: any, id?: string) => Promise<void>;
  removeRecord: (r: AppRecord) => Promise<void>;
};
type Group = 'GOL' | 'DEF' | 'MEI' | 'ATA' | 'OUT';
type Dimension = {
  label: string;
  score: number | null;
  detail: string;
  weight: number;
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const date = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
function autoPosition(raw: string): Group {
  const p = String(raw || '')
    .trim()
    .toUpperCase();
  if (/^(0|GK|GOL|GOALKEEPER)$/.test(p)) return 'GOL';
  if (/^(1)$|CB|LB|RB|LWB|RWB|DEF|ZAG|LAT/.test(p)) return 'DEF';
  if (/^(2)$|CM|CAM|CDM|LM|RM|MEI|MID|VOL/.test(p)) return 'MEI';
  if (/^(3)$|ST|CF|LW|RW|ATA|ATT|FOR|PE|PD/.test(p)) return 'ATA';
  return 'OUT';
}
function per90(value: number, seconds: number) {
  return seconds > 0 ? value / (seconds / 5400) : null;
}
function relative(value: number | null, baseline: number | null) {
  if (value === null || baseline === null) return null;
  if (baseline <= 0) return value > 0 ? 75 : 50;
  return clamp(50 + (value / baseline - 1) * 30);
}
function fitDimensions(player: any, baselines: Map<Group, any>): Dimension[] {
  const base = baselines.get(player.group);
  const rating =
    player.mean === null ? null : relative(player.mean, base?.rating ?? null);
  const production = relative(
    per90(player.goals + player.assists, player.seconds),
    base?.production ?? null,
  );
  const defending = relative(
    per90(player.tackles, player.seconds),
    base?.defending ?? null,
  );
  const weights: Record<Group, [number, number, number]> = {
    GOL: [1, 0, 0],
    DEF: [0.45, 0.15, 0.4],
    MEI: [0.4, 0.3, 0.3],
    ATA: [0.45, 0.45, 0.1],
    OUT: [0.5, 0.3, 0.2],
  };
  const w = weights[player.group as Group];
  return [
    {
      label: 'Desempenho',
      score: rating,
      detail:
        player.mean === null
          ? 'Sem notas nos amistosos'
          : `Nota ${player.mean.toFixed(1)} vs. média da posição ${base?.rating?.toFixed(1) ?? '—'}`,
      weight: w[0],
    },
    {
      label: 'Produção',
      score: production,
      detail: player.seconds
        ? `${(per90(player.goals + player.assists, player.seconds) ?? 0).toFixed(2)} participações/90 vs. ${base?.production?.toFixed(2) ?? '—'}`
        : 'Sem minutos para taxa por 90',
      weight: w[1],
    },
    {
      label: 'Contribuição defensiva',
      score: defending,
      detail: player.seconds
        ? `${(per90(player.tackles, player.seconds) ?? 0).toFixed(2)} desarmes/90 vs. ${base?.defending?.toFixed(2) ?? '—'}`
        : 'Sem minutos para taxa por 90',
      weight: w[2],
    },
  ];
}
function fitScore(dimensions: Dimension[], ratings: number) {
  const available = dimensions.filter((d) => d.score !== null && d.weight > 0);
  const total = available.reduce((n, d) => n + d.weight, 0);
  if (!total) return null;
  const raw = available.reduce((n, d) => n + d.score! * d.weight, 0) / total;
  const reliability = Math.min(1, ratings / 5);
  return Math.round(50 + (raw - 50) * reliability);
}

export function MarketWatchlist({
  matches,
  records,
  admin,
  saveRecord,
  removeRecord,
}: Props) {
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('all');
  const [pipeline, setPipeline] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [status, setStatus] = useState('Em observação');
  const [priority, setPriority] = useState('Média');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState('');
  const [positionOverride, setPositionOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const friendlies = useMemo(
    () => matches.filter((m) => !m.excluded && m.type === 'friendlyMatch'),
    [matches],
  );
  const targets = useMemo(
    () => records.filter((r) => r.kind === 'scout_target'),
    [records],
  );
  const ownBaselines = useMemo(() => {
    const rows = new Map<Group, any[]>();
    const individual = new Map<string, any>();
    for (const m of friendlies)
      for (const p of m.players || []) {
        if (!p.own) continue;
        const x = individual.get(p.id) ?? {
          group: autoPosition(p.position),
          sum: 0,
          ratings: 0,
          goals: 0,
          assists: 0,
          tackles: 0,
          seconds: 0,
        };
        x.goals += p.goals ?? 0;
        x.assists += p.assists ?? 0;
        x.tackles += p.tackles ?? 0;
        x.seconds += p.seconds ?? 0;
        if (p.rating != null) {
          x.sum += p.rating;
          x.ratings++;
        }
        individual.set(p.id, x);
      }
    for (const x of individual.values()) {
      const list = rows.get(x.group) ?? [];
      list.push(x);
      rows.set(x.group, list);
    }
    const result = new Map<Group, any>();
    for (const [group, list] of rows) {
      const rated = list.filter((x) => x.ratings);
      const timed = list.filter((x) => x.seconds);
      result.set(group, {
        rating: rated.length
          ? rated.reduce((n, x) => n + x.sum / x.ratings, 0) / rated.length
          : null,
        production: timed.length
          ? timed.reduce(
              (n, x) => n + (per90(x.goals + x.assists, x.seconds) ?? 0),
              0,
            ) / timed.length
          : null,
        defending: timed.length
          ? timed.reduce((n, x) => n + (per90(x.tackles, x.seconds) ?? 0), 0) /
            timed.length
          : null,
      });
    }
    return result;
  }, [friendlies]);
  const players = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of friendlies)
      for (const p of m.players || []) {
        if (p.own) continue;
        const x = map.get(p.id) ?? {
          id: p.id,
          name: p.name,
          automaticPosition: p.position,
          clubs: new Set<string>(),
          games: 0,
          goals: 0,
          assists: 0,
          tackles: 0,
          seconds: 0,
          sum: 0,
          ratings: 0,
          lastSeen: m.playedAt,
          appearances: [],
        };
        x.games++;
        x.clubs.add(m.opponent);
        x.goals += p.goals ?? 0;
        x.assists += p.assists ?? 0;
        x.tackles += p.tackles ?? 0;
        x.seconds += p.seconds ?? 0;
        if (p.rating != null) {
          x.sum += p.rating;
          x.ratings++;
        }
        if (m.playedAt > x.lastSeen) x.lastSeen = m.playedAt;
        x.appearances.push({ match: m, line: p });
        map.set(p.id, x);
      }
    return [...map.values()]
      .map((p) => {
        const target = targets.find((r) => r.data.playerId === p.id);
        const mean = p.ratings ? p.sum / p.ratings : null;
        const displayPosition =
          target?.data.positionOverride || autoPosition(p.automaticPosition);
        const enriched = {
          ...p,
          clubs: [...p.clubs],
          mean,
          target,
          displayPosition,
          group: displayPosition as Group,
          confidence:
            p.ratings >= 5 ? 'Alta' : p.ratings >= 2 ? 'Média' : 'Baixa',
        };
        const dimensions = fitDimensions(enriched, ownBaselines);
        return {
          ...enriched,
          dimensions,
          fit: fitScore(dimensions, p.ratings),
        };
      })
      .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || b.games - a.games);
  }, [friendlies, targets, ownBaselines]);
  const filtered = players.filter(
    (p) =>
      (!query ||
        `${p.name} ${p.clubs.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (position === 'all' || p.displayPosition === position) &&
      (pipeline === 'all' ||
        (pipeline === 'shortlist'
          ? !!p.target
          : p.target?.data.status === pipeline)),
  );
  const selected = players.find((p) => p.id === selectedId) ?? filtered[0];
  function edit(p: any) {
    setEditing(p);
    setStatus(p.target?.data.status || 'Em observação');
    setPriority(p.target?.data.priority || 'Média');
    setNotes(p.target?.data.notes || '');
    setPhoto(p.target?.data.photo || '');
    setPositionOverride(p.target?.data.positionOverride || '');
    setError('');
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      await saveRecord(
        'scout_target',
        {
          playerId: editing.id,
          playerName: editing.name,
          automaticPosition: editing.automaticPosition,
          positionOverride,
          status,
          priority,
          notes,
          photo,
          updatedAt: new Date().toISOString(),
        },
        editing.target?.id,
      );
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="market-container">
      <div className="scouting-header-box">
        <div className="scouting-title-wrap">
          <h2>Talentos</h2>
          <p>
            Pipeline comparável baseado exclusivamente em amistosos. O encaixe
            compara cada atleta à média atual do time na mesma posição e reduz
            conclusões de amostras pequenas.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Buscar jogador ou clube"
            placeholder="Jogador ou clube"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrar posição"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="all">Todas as posições</option>
          <option>GOL</option>
          <option>DEF</option>
          <option>MEI</option>
          <option>ATA</option>
          <option>OUT</option>
        </select>
        <select
          aria-label="Filtrar pipeline"
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value)}
        >
          <option value="all">Todo o radar</option>
          <option value="shortlist">Na shortlist</option>
          <option>Em observação</option>
          <option>Contato sugerido</option>
          <option>Descartado</option>
        </select>
      </div>
      <div className="overview-grid" style={{ minWidth: 0 }}>
        <section className="panel" style={{ minWidth: 0, overflow: 'hidden' }}>
          <header>
            <h2>Ranking de encaixe</h2>
            <span className="muted">
              {filtered.length} atletas · {friendlies.length} amistosos
            </span>
          </header>
          {filtered.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jogador</th>
                    <th>Pos.</th>
                    <th>Encaixe</th>
                    <th>Amostra</th>
                    <th>Nota</th>
                    <th>Confiança</th>
                    <th>Status</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className={selected?.id === p.id ? 'active' : ''}
                    >
                      <td>
                        <button
                          className="player-name"
                          onClick={() => setSelectedId(p.id)}
                        >
                          {p.target?.data.photo ? (
                            <span className="avatar-small">
                              <img src={p.target.data.photo} alt="" />
                            </span>
                          ) : (
                            <span className="avatar-small">
                              {p.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <b>{p.name}</b>
                        </button>
                      </td>
                      <td>{p.displayPosition}</td>
                      <td>
                        <b>{p.fit === null ? 'Sem base' : `${p.fit}/100`}</b>
                      </td>
                      <td>
                        {p.games} · {p.ratings} notas
                      </td>
                      <td>
                        {p.mean === null
                          ? '—'
                          : p.mean.toLocaleString('pt-BR', {
                              maximumFractionDigits: 1,
                            })}
                      </td>
                      <td>
                        <span className="tag">{p.confidence}</span>
                      </td>
                      <td>{p.target?.data.status || 'Radar'}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Abrir ${p.name}`}
                          onClick={() => setSelectedId(p.id)}
                        >
                          <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <Search size={24} />
              <h3>Nenhum talento encontrado</h3>
              <p>
                Este módulo considera apenas amistosos com estatísticas
                adversárias.
              </p>
            </div>
          )}
        </section>
        <aside className="panel" style={{ minWidth: 0, overflow: 'hidden' }}>
          {selected ? (
            <>
              <header>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ overflowWrap: 'anywhere' }}>{selected.name}</h2>
                  <small style={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {selected.clubs.join(', ')} · visto em{' '}
                    {date(selected.lastSeen)}
                  </small>
                </div>
                {selected.target && admin && (
                  <button
                    className="icon-button"
                    aria-label={`Remover ${selected.name}`}
                    onClick={() => void removeRecord(selected.target)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </header>
              <div className="panel-body">
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'center',
                    minWidth: 0,
                  }}
                >
                  {selected.target?.data.photo ? (
                    <span
                      className="player-avatar"
                      style={{ overflow: 'hidden' }}
                    >
                      <img
                        src={selected.target.data.photo}
                        alt={`Foto de ${selected.name}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    </span>
                  ) : (
                    <span className="player-avatar">
                      {selected.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <b>{selected.displayPosition}</b>
                    <small
                      style={{ display: 'block', overflowWrap: 'anywhere' }}
                    >
                      Automática EA: {autoPosition(selected.automaticPosition)}{' '}
                      ({selected.automaticPosition || 'sem código'})
                    </small>
                  </div>
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <span>Fit score</span>
                  <strong>{selected.fit === null ? '—' : selected.fit}</strong>
                  <small>0–100, ajustado pela amostra</small>
                </div>
                <div className="metric">
                  <span>Amistosos</span>
                  <strong>{selected.games}</strong>
                  <small>{selected.ratings} com nota</small>
                </div>
                <div className="metric">
                  <span>Participações</span>
                  <strong>{selected.goals + selected.assists}</strong>
                  <small>
                    {selected.goals} gols · {selected.assists} assist.
                  </small>
                </div>
              </div>
              <div className="panel-body">
                <h3>Como o encaixe foi calculado</h3>
                {selected.dimensions.map((d: Dimension) => (
                  <div
                    className="list-row"
                    key={d.label}
                    style={{ paddingInline: 0 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <b>{d.label}</b>
                      <small
                        style={{
                          whiteSpace: 'normal',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {d.detail} · peso {Math.round(d.weight * 100)}%
                      </small>
                    </div>
                    <strong>
                      {d.score === null ? 'Sem dado' : Math.round(d.score)}
                    </strong>
                  </div>
                ))}
                <p className="muted">
                  As dimensões disponíveis são reponderadas. A confiança
                  aproxima o resultado de 50 até completar cinco atuações com
                  nota.
                </p>
              </div>
              {selected.target && (
                <div className="ai-analysis-pro">
                  <div className="ai-header">
                    <ClipboardCheck size={16} />
                    <b>
                      {selected.target.data.status} · prioridade{' '}
                      {selected.target.data.priority || 'não definida'}
                    </b>
                  </div>
                  <p style={{ overflowWrap: 'anywhere' }}>
                    {selected.target.data.notes || 'Sem notas da diretoria.'}
                  </p>
                </div>
              )}
              {admin && (
                <button
                  className="button primary"
                  style={{ margin: 20 }}
                  onClick={() => edit(selected)}
                >
                  <Star size={15} />
                  {selected.target
                    ? 'Editar perfil e avaliação'
                    : 'Adicionar ao pipeline'}
                </button>
              )}
              <div className="section-title-bar">
                <div>
                  <h3>Evidências</h3>
                  <p>Atuações em amistosos que sustentam a leitura.</p>
                </div>
              </div>
              {selected.appearances
                .sort((a: any, b: any) =>
                  b.match.playedAt.localeCompare(a.match.playedAt),
                )
                .slice(0, 8)
                .map((a: any) => (
                  <div className="list-row" key={a.match.id}>
                    <span>{date(a.match.playedAt)}</span>
                    <b
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      por {a.match.opponent}
                    </b>
                    <strong>
                      {a.line.rating != null
                        ? `Nota ${a.line.rating}`
                        : 'Sem nota'}
                    </strong>
                  </div>
                ))}
            </>
          ) : (
            <div className="empty">
              <Search size={24} />
              <h3>Selecione um atleta</h3>
            </div>
          )}
        </aside>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="talent-title"
          >
            <header>
              <h2 id="talent-title">Editar {editing.name}</h2>
              <button
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setEditing(null)}
              >
                <X size={17} />
              </button>
            </header>
            <div className="data-form">
              <label>
                Foto do jogador
                <input
                  type="url"
                  value={photo}
                  onChange={(e) => setPhoto(e.target.value)}
                  placeholder="https://…"
                />
                <small>
                  <Camera size={13} /> URL HTTPS; deixe vazio para usar as
                  iniciais.
                </small>
              </label>
              <label>
                Posição exibida
                <select
                  value={positionOverride}
                  onChange={(e) => setPositionOverride(e.target.value)}
                >
                  <option value="">
                    Automática da EA: {autoPosition(editing.automaticPosition)}
                  </option>
                  <option>GOL</option>
                  <option>DEF</option>
                  <option>MEI</option>
                  <option>ATA</option>
                  <option>OUT</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>Em observação</option>
                  <option>Contato sugerido</option>
                  <option>Descartado</option>
                </select>
              </label>
              <label>
                Prioridade
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option>Alta</option>
                  <option>Média</option>
                  <option>Baixa</option>
                </select>
              </label>
              <label>
                Notas
                <textarea
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contexto, encaixe e pontos a validar"
                />
              </label>
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
