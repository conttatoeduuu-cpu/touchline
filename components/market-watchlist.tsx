'use client';

import { useState, useMemo } from 'react';
import { Search, Star, BookmarkPlus, Eye, MessageSquare, Shield, Check, Filter, UserCheck, Trash2 } from 'lucide-react';
import type { Match, RecordItem } from '@/lib/domain';

type AppRecord = RecordItem<Record<string, any>>;

interface MarketWatchlistProps {
  matches: Match[];
  records: AppRecord[];
  admin: boolean;
  saveRecord: (kind: string, data: any, id?: string) => Promise<void>;
  removeRecord: (r: AppRecord) => Promise<void>;
}

const fmt = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: dec });

function cleanPos(pos: string) {
  const p = (pos ?? '').toLowerCase();
  if (p.includes('goal') || p === 'gk') return { label: 'GOL', cls: 'pos-gk' };
  if (p.includes('def') || ['cb', 'lb', 'rb', 'lwb', 'rwb'].includes(p)) return { label: 'DEF', cls: 'pos-def' };
  if (p.includes('mid') || ['cdm', 'cm', 'cam', 'lm', 'rm'].includes(p)) return { label: 'MEI', cls: 'pos-mid' };
  if (p.includes('for') || p.includes('att') || ['st', 'cf', 'lw', 'rw'].includes(p)) return { label: 'ATA', cls: 'pos-att' };
  return { label: pos ? pos.toUpperCase().slice(0, 3) : '—', cls: 'pos-gen' };
}

export function MarketWatchlist({
  matches,
  records,
  admin,
  saveRecord,
  removeRecord,
}: MarketWatchlistProps) {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [minGames, setMinGames] = useState(1);
  const [viewTab, setViewTab] = useState<'all' | 'shortlist'>('all');
  const [editingPlayer, setEditingPlayer] = useState<any | null>(null);
  const [statusInput, setStatusInput] = useState('Em Observação');
  const [notesInput, setNotesInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Registros de shortlist salvos
  const shortlistRecords = useMemo(
    () => records.filter((r) => r.kind === 'scout_target'),
    [records]
  );

  // Extrai e agrega todos os jogadores adversários que já enfrentamos
  const observedPlayers = useMemo(() => {
    const map = new Map<string, any>();

    for (const m of matches) {
      if (m.excluded) continue;
      for (const p of m.players) {
        if (p.own) continue; // Só adversários
        const existing = map.get(p.id) ?? {
          id: p.id,
          name: p.name,
          position: p.position,
          clubs: new Set<string>(),
          games: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          tackles: 0,
          ratings: 0,
          ratingSum: 0,
        };

        existing.games += 1;
        if (m.opponent) existing.clubs.add(m.opponent);
        if (p.goals) existing.goals += p.goals;
        if (p.assists) existing.assists += p.assists;
        if (p.shots) existing.shots += p.shots;
        if (p.tackles) existing.tackles += p.tackles;
        if (p.rating !== null && p.rating !== undefined) {
          existing.ratingSum += p.rating;
          existing.ratings += 1;
        }
        map.set(p.id, existing);
      }
    }

    const list = [...map.values()].map((p) => {
      const avgRating = p.ratings > 0 ? p.ratingSum / p.ratings : null;
      // Índice de Scout com amortecimento estatístico (Bayesiano):
      const bayesianIndex = avgRating !== null ? (avgRating * p.ratings + 7.0 * 3) / (p.ratings + 3) : 7.0;
      const shortlist = shortlistRecords.find((r) => r.data.playerId === p.id);
      return {
        ...p,
        clubs: [...p.clubs],
        avgRating,
        bayesianIndex,
        shortlist: shortlist ? shortlist.data : null,
        shortlistId: shortlist ? shortlist.id : null,
      };
    });

    return list.sort((a, b) => b.bayesianIndex - a.bayesianIndex);
  }, [matches, shortlistRecords]);

  // Filtros aplicados
  const filtered = useMemo(() => {
    return observedPlayers.filter((p) => {
      if (viewTab === 'shortlist' && !p.shortlist) return false;
      if (p.games < minGames) return false;
      const pos = cleanPos(p.position).label;
      if (posFilter !== 'all' && pos !== posFilter) return false;
      if (query.trim() && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [observedPlayers, viewTab, minGames, posFilter, query]);

  async function handleSaveShortlist() {
    if (!editingPlayer) return;
    setBusy(true);
    try {
      await saveRecord(
        'scout_target',
        {
          playerId: editingPlayer.id,
          playerName: editingPlayer.name,
          position: editingPlayer.position,
          status: statusInput,
          notes: notesInput,
          updatedAt: new Date().toISOString(),
        },
        editingPlayer.shortlistId || undefined
      );
      setEditingPlayer(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="market-container">
      {/* CABEÇALHO DO MERCADO & SCOUT */}
      <div className="market-header-box">
        <div className="market-title">
          <h2>Radar de Mercado & Jogadores Observados</h2>
          <p>
            Análise aprofundada de atletas que enfrentamos em campo. Descubra talentos e monte a
            shortlist de contratações da diretoria.
          </p>
        </div>

        {/* Abas Superiores: Todos vs Shortlist */}
        <div className="market-tabs-pill">
          <button
            className={`tab-btn ${viewTab === 'all' ? 'active' : ''}`}
            onClick={() => setViewTab('all')}
          >
            Radar de Adversários ({observedPlayers.length})
          </button>
          <button
            className={`tab-btn ${viewTab === 'shortlist' ? 'active' : ''}`}
            onClick={() => setViewTab('shortlist')}
          >
            ⭐ Shortlist da Diretoria ({shortlistRecords.length})
          </button>
        </div>
      </div>

      {/* BARRA DE FILTROS E PESQUISA */}
      <div className="market-toolbar">
        <div className="market-search">
          <Search size={16} />
          <input
            placeholder="Buscar por GamerTag ou Jogador..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="market-filters">
          <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
            <option value="all">Todas as Posições</option>
            <option value="ATA">Ataque (ATA)</option>
            <option value="MEI">Meio-Campo (MEI)</option>
            <option value="DEF">Defesa (DEF)</option>
            <option value="GOL">Goleiro (GOL)</option>
          </select>

          <select value={minGames} onChange={(e) => setMinGames(Number(e.target.value))}>
            <option value={1}>1+ Jogo Observado</option>
            <option value={2}>2+ Jogos (Consistência)</option>
            <option value={3}>3+ Jogos (Frequente)</option>
          </select>
        </div>
      </div>

      {/* GRID DE CARDS DE SCOUT */}
      <div className="market-cards-grid">
        {filtered.map((p) => {
          const pos = cleanPos(p.position);
          const hasShortlist = Boolean(p.shortlist);

          return (
            <div
              key={p.id}
              className={`market-card ${hasShortlist ? 'card-shortlisted' : ''}`}
            >
              {/* Topo do Card */}
              <div className="card-top">
                <div className="card-player-main">
                  <div className={`player-avatar-badge ${pos.cls}`}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="player-tag-name">{p.name}</h4>
                    <span className="player-club-sub">
                      {p.clubs.slice(0, 2).join(' • ') || 'Adversário'}
                    </span>
                  </div>
                </div>

                <span className={`pos-badge-pill ${pos.cls}`}>{pos.label}</span>
              </div>

              {/* Status na Shortlist se houver */}
              {p.shortlist && (
                <div className={`shortlist-status-pill ${p.shortlist.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                  <Star size={11} fill="currentColor" />
                  {p.shortlist.status}
                </div>
              )}

              {/* Métricas Chave de Desempenho Contra Nós */}
              <div className="card-stats-row">
                <div className="stat-box">
                  <small>JOGOS</small>
                  <b>{p.games}</b>
                </div>
                <div className="stat-box">
                  <small>GOLS</small>
                  <b>{p.goals}</b>
                </div>
                <div className="stat-box">
                  <small>ASSIST.</small>
                  <b>{p.assists}</b>
                </div>
                <div className="stat-box">
                  <small>NOTA MÉDIA</small>
                  <b className="stat-rating">{fmt(p.avgRating, 1)}</b>
                </div>
              </div>

              {/* Índice de Scout Ajustado */}
              <div className="scout-index-bar">
                <div className="scout-index-label">
                  <span>Índice de Potencial / Scout</span>
                  <strong>{fmt(p.bayesianIndex, 2)}</strong>
                </div>
                <div className="scout-bar-track">
                  <div
                    className="scout-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(10, ((p.bayesianIndex - 5) / 5) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Notas Confidenciais se houver */}
              {p.shortlist?.notes && (
                <p className="shortlist-notes-snippet">
                  📝 "{p.shortlist.notes}"
                </p>
              )}

              {/* Ações para Diretor */}
              {admin && (
                <div className="card-footer-actions">
                  <button
                    className="button small"
                    onClick={() => {
                      setEditingPlayer(p);
                      setStatusInput(p.shortlist?.status || 'Em Observação');
                      setNotesInput(p.shortlist?.notes || '');
                    }}
                  >
                    <BookmarkPlus size={14} />
                    {hasShortlist ? 'Editar Status' : 'Adicionar à Shortlist'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!filtered.length && (
        <div className="empty-market">
          <Shield size={36} />
          <h3>Nenhum jogador encontrado com esses filtros</h3>
          <p>Tente ajustar a busca por nome, o filtro de posições ou o mínimo de jogos.</p>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE SHORTLIST */}
      {editingPlayer && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog">
            <header>
              <h2>Avaliação de Scout • {editingPlayer.name}</h2>
              <button className="icon-button" onClick={() => setEditingPlayer(null)}>
                ✕
              </button>
            </header>

            <div className="data-form">
              <label>
                Status da Contratação / Scout
                <select
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value)}
                >
                  <option>Interesse Real</option>
                  <option>Em Observação</option>
                  <option>Contatado / Em Conversa</option>
                  <option>Descartado</option>
                </select>
              </label>

              <label>
                Anotações Confidenciais da Diretoria
                <textarea
                  rows={3}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Ex: Ponta muito veloz, finaliza bem de esquerda. Vale a pena monitorar."
                />
              </label>

              <div className="actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={handleSaveShortlist}
                >
                  <Check size={16} />
                  {busy ? 'Salvando…' : 'Salvar na Shortlist'}
                </button>
                {editingPlayer.shortlistId && (
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={async () => {
                      const rec = shortlistRecords.find(
                        (r) => r.id === editingPlayer.shortlistId
                      );
                      if (rec) {
                        setBusy(true);
                        try {
                          await removeRecord(rec);
                          setEditingPlayer(null);
                        } finally {
                          setBusy(false);
                        }
                      }
                    }}
                  >
                    <Trash2 size={15} /> Remover da Shortlist
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
