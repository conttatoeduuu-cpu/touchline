'use client';
/* oxlint-disable typescript/no-explicit-any, next/no-img-element, jsx-a11y/prefer-tag-over-role -- EA rows and persisted records are schemaless; private image URLs cannot use the static image loader. */
import { useMemo, useState } from 'react';
import {
  Camera,
  Search,
  Star,
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
        : 'Minutos não registrados pela fonte',
      weight: w[1],
    },
    {
      label: 'Contribuição defensiva',
      score: defending,
      detail: player.seconds
        ? `${(per90(player.tackles, player.seconds) ?? 0).toFixed(2)} desarmes/90 vs. ${base?.defending?.toFixed(2) ?? '—'}`
        : 'Minutos não registrados pela fonte',
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

function RadarChart({ player, baselines }: { player: any; baselines: Map<Group, any> }) {
  const base = baselines.get(player.group);
  const axes = [
    { label: 'Gols/90', val: per90(player.goals, player.seconds) ?? 0, base: base?.goals90 ?? 0 },
    { label: 'Ast/90', val: per90(player.assists, player.seconds) ?? 0, base: base?.assists90 ?? 0 },
    { label: 'Chu/90', val: per90(player.shots, player.seconds) ?? 0, base: base?.shots90 ?? 0 },
    { label: 'Pas/90', val: per90(player.passes, player.seconds) ?? 0, base: base?.passes90 ?? 0 },
    { label: 'Des/90', val: per90(player.tackles, player.seconds) ?? 0, base: base?.tackles90 ?? 0 },
  ];
  
  const size = 200;
  const center = size / 2;
  const radius = size / 2 - 25;
  
  const getPoint = (val: number, max: number, index: number, total: number) => {
    const rRatio = max > 0 ? Math.min(val / (max * 2 || 1), 1) : (val > 0 ? 1 : 0);
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return {
      x: center + radius * rRatio * Math.cos(angle),
      y: center + radius * rRatio * Math.sin(angle),
    };
  };

  const getBasePoint = (index: number, total: number) => {
    const rRatio = 0.5; // baseline is always at 50%
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return {
      x: center + radius * rRatio * Math.cos(angle),
      y: center + radius * rRatio * Math.sin(angle),
    };
  };
  
  const getLabelPoint = (index: number, total: number) => {
    const rRatio = 1.25;
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return {
      x: center + radius * rRatio * Math.cos(angle),
      y: center + radius * rRatio * Math.sin(angle),
    };
  };

  const polyBase = axes.map((_, i) => {
    const pt = getBasePoint(i, axes.length);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  const polyPlayer = axes.map((ax, i) => {
    const pt = getPoint(ax.val, ax.base, i, axes.length);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', maxWidth: '240px', display: 'block', margin: '0 auto' }}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--line)" strokeDasharray="2 2" />
      <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="var(--line)" strokeDasharray="2 2" />
      
      {axes.map((_, i) => {
        const _pt = getLabelPoint(i, axes.length);
        const linePt = {
           x: center + radius * Math.cos((Math.PI * 2 * i) / axes.length - Math.PI / 2),
           y: center + radius * Math.sin((Math.PI * 2 * i) / axes.length - Math.PI / 2)
        };
        return <line key={`l-${i}`} x1={center} y1={center} x2={linePt.x} y2={linePt.y} stroke="var(--line)" />;
      })}
      
      <polygon points={polyBase} fill="var(--muted)" opacity="0.2" stroke="var(--muted)" strokeWidth="1" />
      
      <polygon points={polyPlayer} fill="var(--accent)" opacity="0.4" />
      <polygon points={polyPlayer} fill="none" stroke="var(--accent)" strokeWidth="2" />
      
      {axes.map((ax, i) => {
        const pt = getLabelPoint(i, axes.length);
        return (
          <text key={`t-${i}`} x={pt.x} y={pt.y} fill="var(--text)" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
            {ax.label}
          </text>
        );
      })}
    </svg>
  );
}

function ComparisonBars({ player, baselines }: { player: any; baselines: Map<Group, any> }) {
  const base = baselines.get(player.group);
  const stats = [
    { label: 'Gols/90', val: per90(player.goals, player.seconds) ?? 0, base: base?.goals90 ?? 0 },
    { label: 'Assist/90', val: per90(player.assists, player.seconds) ?? 0, base: base?.assists90 ?? 0 },
    { label: 'Chutes/90', val: per90(player.shots, player.seconds) ?? 0, base: base?.shots90 ?? 0 },
    { label: 'Passes/90', val: per90(player.passes, player.seconds) ?? 0, base: base?.passes90 ?? 0 },
    { label: 'Desarmes/90', val: per90(player.tackles, player.seconds) ?? 0, base: base?.tackles90 ?? 0 },
  ];

  return (
    <div className="talent-comparison-bars" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {stats.map(s => {
        const diff = s.val - s.base;
        const max = Math.max(s.val, s.base, 0.1);
        const pWidth = (s.val / max) * 100;
        const bWidth = (s.base / max) * 100;
        const isAbove = diff >= 0;
        
        return (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>{s.label}</span>
              <span style={{ color: isAbove ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)' }}>
                {isAbove ? 'Acima da média' : 'Abaixo da média'}
              </span>
            </div>
            <div style={{ position: 'relative', height: '16px', background: 'var(--line)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '8px', width: `${bWidth}%`, background: 'var(--muted)', opacity: 0.5 }} />
              <div style={{ position: 'absolute', top: '8px', left: 0, height: '8px', width: `${pWidth}%`, background: 'var(--accent)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
              <span>Atleta: {s.val.toFixed(2)}</span>
              <span>Média: {s.base.toFixed(2)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ appearances }: { appearances: any[] }) {
  const valid = appearances.filter(a => a.line.rating != null).sort((a,b) => a.match.playedAt.localeCompare(b.match.playedAt)).slice(-8);
  if (valid.length < 2) return <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Aguardando dados</div>;
  
  const min = Math.min(...valid.map(a => a.line.rating));
  const max = Math.max(...valid.map(a => a.line.rating));
  const range = max - min || 1;
  const h = 60;
  const w = 120;
  const gap = w / (valid.length - 1);
  
  const pts = valid.map((a, i) => {
    const x = i * gap;
    const y = h - ((a.line.rating - min) / range) * (h - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {valid.map((a, i) => {
        const x = i * gap;
        const y = h - ((a.line.rating - min) / range) * (h - 10) - 5;
        return (
          <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />
        );
      })}
    </svg>
  );
}

export function MarketWatchlist({
  matches,
  records,
  admin,
  saveRecord,
  removeRecord: _removeRecord,
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
          shots: 0,
          passes: 0,
          passAttempts: 0,
          saves: 0,
          redCards: 0,
          seconds: 0,
        };
        x.goals += p.goals ?? 0;
        x.assists += p.assists ?? 0;
        x.tackles += p.tackles ?? 0;
        x.shots += p.shots ?? 0;
        x.passes += p.passes ?? 0;
        x.passAttempts += p.passAttempts ?? 0;
        x.saves += p.saves ?? 0;
        x.redCards += p.redCards ?? 0;
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
        goals90: timed.length ? timed.reduce((n, x) => n + (per90(x.goals, x.seconds) ?? 0), 0) / timed.length : null,
        assists90: timed.length ? timed.reduce((n, x) => n + (per90(x.assists, x.seconds) ?? 0), 0) / timed.length : null,
        shots90: timed.length ? timed.reduce((n, x) => n + (per90(x.shots, x.seconds) ?? 0), 0) / timed.length : null,
        passes90: timed.length ? timed.reduce((n, x) => n + (per90(x.passes, x.seconds) ?? 0), 0) / timed.length : null,
        tackles90: timed.length ? timed.reduce((n, x) => n + (per90(x.tackles, x.seconds) ?? 0), 0) / timed.length : null,
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
          shots: 0,
          passes: 0,
          passAttempts: 0,
          saves: 0,
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
        x.shots += p.shots ?? 0;
        x.passes += p.passes ?? 0;
        x.passAttempts += p.passAttempts ?? 0;
        x.saves += p.saves ?? 0;
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

  const getStatusColor = (status: string) => {
    if (status === 'Em observação') return 'blue';
    if (status === 'Contato sugerido') return 'green';
    if (status === 'Descartado') return 'red';
    return 'gray';
  };

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
      <div className="overview-grid" style={{ minWidth: 0, display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        
        {/* LEFT PANEL - RANKING */}
        <section className="panel" style={{ flex: '0 0 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <header style={{ paddingBottom: '12px', borderBottom: '1px solid var(--line)' }}>
            <h2>Ranking de encaixe</h2>
            <span className="muted">
              {filtered.length} atletas · {friendlies.length} amistosos
            </span>
          </header>
          {filtered.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  className={`talent-card ${selected?.id === p.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                  style={{
                    textAlign: 'left',
                    background: selected?.id === p.id ? 'var(--panel-hover, rgba(255,255,255,0.05))' : 'var(--panel)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: `1px solid ${selected?.id === p.id ? 'var(--accent)' : 'var(--line)'}`,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    width: '100%',
                    display: 'block'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {p.target?.data.photo ? (
                      <img src={p.target.data.photo} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h3>
                        <span className={`status-pill ${getStatusColor(p.target?.data.status)}`} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          {p.target?.data.status || 'Radar'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <b>{p.displayPosition}</b> · {p.clubs.join(', ')}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div className="talent-fit-bar" style={{ flex: 1, height: '6px', background: 'var(--line)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div className="fit-fill" style={{ width: `${p.fit ?? 0}%`, height: '100%', background: (p.fit ?? 0) > 70 ? 'var(--green, #22c55e)' : (p.fit ?? 0) >= 40 ? 'var(--yellow, #eab308)' : 'var(--red, #ef4444)' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', width: '28px', textAlign: 'right' }}>
                      {p.fit === null ? 'N/R' : p.fit}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                    <span>{p.games}J</span>
                    <span>{p.goals}G {p.assists}A</span>
                    <span>★ {p.mean === null ? 'N/R' : p.mean.toFixed(1)}</span>
                    <div className="confidence-dots" style={{ display: 'flex', gap: '3px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.confidence === 'Alta' || p.confidence === 'Média' || p.confidence === 'Baixa' ? 'currentColor' : 'var(--line)' }} />
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.confidence === 'Alta' || p.confidence === 'Média' ? 'currentColor' : 'var(--line)' }} />
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.confidence === 'Alta' ? 'currentColor' : 'var(--line)' }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Search size={24} />
              <h3>Nenhum talento encontrado</h3>
              <p>Este módulo considera apenas amistosos com estatísticas adversárias.</p>
            </div>
          )}
        </section>

        {/* RIGHT PANEL - DETAIL */}
        <aside className="panel" style={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '24px' }}>
              
              {/* 1. Header */}
              <header style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                {selected.target?.data.photo ? (
                  <img src={selected.target.data.photo} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold' }}>
                    {selected.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '24px', margin: '0 0 4px 0' }}>{selected.name}</h2>
                  <div style={{ fontSize: '15px', color: 'var(--muted)' }}>
                    <b>{selected.displayPosition}</b> · {selected.clubs.join(', ')}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
                    Visto pela última vez em {date(selected.lastSeen)}
                  </div>
                </div>
              </header>

              {/* 2. Fit Score Card & Pipeline controls */}
              <div style={{ display: 'flex', gap: '24px', background: 'var(--panel)', padding: '20px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingRight: '24px', borderRight: '1px solid var(--line)', minWidth: '120px' }}>
                  <div style={{ fontSize: '42px', fontWeight: 'bold', color: selected.fit === null ? 'var(--muted)' : selected.fit > 70 ? 'var(--green, #22c55e)' : selected.fit >= 40 ? 'var(--yellow, #eab308)' : 'var(--red, #ef4444)', lineHeight: 1 }}>
                    {selected.fit === null ? 'N/R' : selected.fit}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>Score de Encaixe</div>
                  <div style={{ fontSize: '11px', marginTop: '6px' }}>Confiança: <b>{selected.confidence}</b></div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="muted">Status de Pipeline</span>
                    <span className={`status-pill ${getStatusColor(selected.target?.data.status)}`} style={{ fontSize: '13px', padding: '4px 10px', borderRadius: '12px' }}>
                      {selected.target?.data.status || 'Radar'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="muted">Nível de Prioridade</span>
                    <b style={{ fontSize: '14px' }}>{selected.target?.data.priority || 'Não definida'}</b>
                  </div>
                  {admin && (
                    <button className="button primary" style={{ marginTop: 'auto', padding: '8px', alignSelf: 'flex-start' }} onClick={() => edit(selected)}>
                      <Star size={15} /> {selected.target ? 'Editar pipeline e perfil' : 'Adicionar ao pipeline'}
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Radar & 6. Comparisons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
                <div className="talent-radar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel)', padding: '20px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Perfil de Produção vs {selected.group}</h3>
                  <RadarChart player={selected} baselines={ownBaselines} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel)', padding: '20px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <h3 style={{ margin: 0, fontSize: '14px' }}>Comparação de Baseline (Posição)</h3>
                  <ComparisonBars player={selected} baselines={ownBaselines} />
                </div>
              </div>

              {/* 4. Stats Grid */}
              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>Estatísticas Gerais (Amistosos)</h3>
                <div className="talent-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Jogos / Minutos</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{selected.games}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{Math.floor(selected.seconds / 60)}' jogados</span>
                  </div>
                  
                  <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Gols</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{selected.goals}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{((per90(selected.goals, selected.seconds) ?? 0)).toFixed(2)}/90</span>
                    <span style={{ fontSize: '11px', marginTop: '6px', color: 'var(--accent)' }}>Taxa conv: {selected.shots > 0 ? Math.round((selected.goals/selected.shots)*100) : 0}%</span>
                  </div>

                  <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Assistências</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{selected.assists}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{((per90(selected.assists, selected.seconds) ?? 0)).toFixed(2)}/90</span>
                  </div>

                  <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Chutes</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{selected.shots}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{((per90(selected.shots, selected.seconds) ?? 0)).toFixed(2)}/90</span>
                  </div>

                  <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Desarmes</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{selected.tackles}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{((per90(selected.tackles, selected.seconds) ?? 0)).toFixed(2)}/90</span>
                  </div>

                  <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Passes</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{selected.passes}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{((per90(selected.passes, selected.seconds) ?? 0)).toFixed(2)}/90</span>
                    <span style={{ fontSize: '11px', marginTop: '6px', color: 'var(--accent)' }}>Precisão: {selected.passAttempts > 0 ? Math.round((selected.passes/selected.passAttempts)*100) : 0}%</span>
                  </div>
                </div>
              </div>

              {/* 5. Rating Sparkline & 7. Recent Appearances */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>Últimas Atuações (até 8 jogos)</h3>
                  <div className="talent-sparkline" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Tendência de Nota</span>
                    <Sparkline appearances={selected.appearances} />
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selected.appearances.sort((a: any, b: any) => b.match.playedAt.localeCompare(a.match.playedAt)).slice(0, 8).map((a: any) => (
                    <div className="talent-appearance" key={a.match.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--panel)', borderRadius: '6px', border: '1px solid var(--line)', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>vs {a.match.opponent}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{date(a.match.playedAt)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                          {a.line.goals ?? 0}G · {a.line.assists ?? 0}A
                        </div>
                        <div style={{ padding: '6px 12px', background: 'var(--line)', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', color: a.line.rating ? (a.line.rating >= 7 ? 'var(--green, #22c55e)' : a.line.rating >= 6 ? 'var(--yellow, #eab308)' : 'var(--red, #ef4444)') : 'inherit' }}>
                          {a.line.rating ? a.line.rating.toFixed(1) : 'N/R'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="empty">
              <Search size={24} />
              <h3>Selecione um atleta</h3>
            </div>
          )}
        </aside>
      </div>
      
      {/* 8. Pipeline Editing Modal */}
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
