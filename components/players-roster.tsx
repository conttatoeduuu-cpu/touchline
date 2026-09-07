'use client';
/* oxlint-disable typescript/no-explicit-any, jsx-a11y/prefer-tag-over-role, next/no-img-element -- Player records and private media URLs are runtime-provided. */

import { useState, useMemo } from 'react';
import { Search, Camera, Pencil, GitCompareArrows, Shield, LayoutGrid, List } from 'lucide-react';

interface PlayersRosterProps {
  roster: any[];
  admin: boolean;
  onEditPlayer: (p: any) => void;
  onSelectPlayer: (p: any) => void;
  onCompare: (players: any[]) => void;
  teamShort: string;
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

function ratingClass(r: number | null) {
  if (!r) return '';
  if (r >= 8.0) return 'rating-elite';
  if (r >= 7.0) return 'rating-high';
  if (r >= 6.0) return 'rating-med';
  return 'rating-low';
}

export function PlayersRoster({
  roster,
  admin,
  onEditPlayer,
  onSelectPlayer,
  onCompare,
  teamShort,
}: PlayersRosterProps) {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [comparison, setComparison] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return roster
      .filter((p) => !p.inactive)
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => {
        if (posFilter === 'all') return true;
        return cleanPos(p.position).label === posFilter;
      })
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [roster, query, posFilter]);

  return (
    <div className="roster-container">
      {/* BARRA DE FERRAMENTAS DO ELENCO */}
      <div className="roster-toolbar">
        <div className="roster-search">
          <Search size={16} />
          <input
            aria-label="Buscar jogador do elenco"
            placeholder="Buscar jogador do elenco..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="roster-controls">
          <select aria-label="Filtrar elenco por posição" value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
            <option value="all">Todas as posições</option>
            <option value="ATA">Ataque (ATA)</option>
            <option value="MEI">Meio-Campo (MEI)</option>
            <option value="DEF">Defesa (DEF)</option>
            <option value="GOL">Goleiro (GOL)</option>
          </select>

          {/* Alternador de visualização Cards vs Tabela */}
          <div className="view-mode-toggle">
            <button
              type="button"
              className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Visualização em Cards"
              aria-pressed={viewMode === 'cards'}
            >
              <LayoutGrid size={16} /> Cards
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Visualização em Tabela"
              aria-pressed={viewMode === 'table'}
            >
              <List size={16} /> Tabela
            </button>
          </div>

          <button
            type="button"
            className="button small"
            disabled={comparison.length !== 2}
            onClick={() => onCompare(roster.filter((p) => comparison.includes(p.id)))}
          >
            <GitCompareArrows size={14} /> Comparar ({comparison.length}/2)
          </button>
        </div>
      </div>

      {/* MODO 1: CARDS DO ELENCO (ESTILO EA FC PRO) */}
      {viewMode === 'cards' ? (
        <div className="player-cards-grid">
          {filtered.map((p) => {
            const pos = cleanPos(p.position);
            const isComparing = comparison.includes(p.id);

            return (
              <div key={p.id} className="fc-player-card">
                {/* Cabeçalho do Card: Nota, Camisa e Posição */}
                <div className="fc-card-header">
                  <div className="fc-rating-stack">
                    <b className="fc-rating-num">{p.rating ? fmt(p.rating, 1) : '—'}</b>
                    <span className={`fc-pos-badge ${pos.cls}`}>{pos.label}</span>
                  </div>

                  <div className="fc-card-top-right">
                    {p.number && <span className="fc-shirt-num">#{p.number}</span>}
                    <span className="fc-club-name">{teamShort}</span>
                  </div>
                </div>

                {/* Foto ou Avatar do Atleta */}
                <div
                  className="fc-avatar-container"
                  onClick={() => onSelectPlayer(p)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir perfil de ${p.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPlayer(p);
                    }
                  }}
                >
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} className="fc-player-photo" />
                  ) : (
                    <div className={`fc-no-photo-avatar ${pos.cls}`}>
                      <span className="fc-avatar-initials">{p.name.slice(0, 2).toUpperCase()}</span>
                      <span className="fc-avatar-watermark">{teamShort}</span>
                    </div>
                  )}

                  {admin && (
                    <button
                      type="button"
                      className="fc-photo-edit-btn"
                      title="Alterar foto do jogador"
                      aria-label={`Alterar foto de ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditPlayer(p);
                      }}
                    >
                      <Camera size={13} />
                    </button>
                  )}
                </div>

                {/* Nome do Jogador */}
                <div className="fc-name-strip">
                  <h3>{p.name}</h3>
                  <small>{p.nationality || 'Nacionalidade não informada'}</small>
                </div>

                {/* Linha de Estatísticas Chave */}
                <div className="fc-stats-grid">
                  <div className="fc-stat-item">
                    <small>JOGOS</small>
                    <b>{p.games ?? '—'}</b>
                  </div>
                  <div className="fc-stat-item">
                    <small>GOLS</small>
                    <b>{p.available?.goals ? p.goals ?? '—' : '—'}</b>
                  </div>
                  <div className="fc-stat-item">
                    <small>ASSIST</small>
                    <b>{p.available?.assists ? p.assists ?? '—' : '—'}</b>
                  </div>
                  <div className="fc-stat-item">
                    <small>PASSES</small>
                    <b>{p.passAccuracy !== null && p.passAccuracy !== undefined ? `${fmt(p.passAccuracy, 0)}%` : '—'}</b>
                  </div>
                </div>

                {/* Rodapé do Card com Ações */}
                <div className="fc-card-footer">
                  <label className="compare-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isComparing}
                      onChange={(e) =>
                        setComparison(
                          e.target.checked
                            ? [...comparison.slice(-1), p.id]
                            : comparison.filter((id) => id !== p.id)
                        )
                      }
                    />
                    <span>Comparar</span>
                  </label>

                  {admin && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Editar perfil"
                      aria-label={`Editar perfil de ${p.name}`}
                      onClick={() => onEditPlayer(p)}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODO 2: TABELA DE SCOUT DETALHADA */
        <div className="table-wrap roster-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Comparar</th>
                <th>Jogador</th>
                <th>POS</th>
                <th>Camisa</th>
                <th>Jogos</th>
                <th>Gols</th>
                <th>Assist.</th>
                <th>Passes %</th>
                <th>Nota Média</th>
                {admin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pos = cleanPos(p.position);
                const isComparing = comparison.includes(p.id);

                return (
                  <tr key={p.id}>
                    <td>
                      <input
                        aria-label={`Selecionar ${p.name} para comparação`}
                        type="checkbox"
                        checked={isComparing}
                        onChange={(e) =>
                          setComparison(
                            e.target.checked
                              ? [...comparison.slice(-1), p.id]
                              : comparison.filter((id) => id !== p.id)
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-player-cell"
                        onClick={() => onSelectPlayer(p)}
                        aria-label={`Abrir perfil de ${p.name}`}
                        style={{ background: 'none', border: 0, padding: 0, color: 'inherit', width: '100%', textAlign: 'left' }}
                      >
                        <div className="table-avatar">
                          {p.photo ? (
                            <img src={p.photo} alt={p.name} />
                          ) : (
                            <span>{p.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <b>{p.name}</b>
                          <small>{p.nationality || 'Nacionalidade não informada'}</small>
                        </div>
                      </button>
                    </td>
                    <td>
                      <span className={`pos-tag ${pos.cls}`}>{pos.label}</span>
                    </td>
                    <td>
                      <span className="shirt-tag">{p.number ? `#${p.number}` : '—'}</span>
                    </td>
                    <td>{p.games}</td>
                    <td>
                      {!p.available?.goals ? '—' : (p.goals ?? 0) > 0 ? (
                        <span className="stat-highlight goal">{p.goals}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>
                      {!p.available?.assists ? '—' : (p.assists ?? 0) > 0 ? (
                        <span className="stat-highlight assist">{p.assists}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>{p.passAccuracy !== null && p.passAccuracy !== undefined ? `${fmt(p.passAccuracy, 1)}%` : '—'}</td>
                    <td>
                      <span className={`match-rating-badge ${ratingClass(p.rating)}`}>
                        {fmt(p.rating, 2)}
                      </span>
                    </td>
                    {admin && (
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          title="Editar perfil e foto"
                          aria-label={`Editar perfil e foto de ${p.name}`}
                          onClick={() => onEditPlayer(p)}
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!filtered.length && (
        <div className="empty-roster">
          <Shield size={36} />
          <h3>Nenhum jogador encontrado</h3>
          <p>Tente ajustar a busca ou o filtro de posições.</p>
        </div>
      )}
    </div>
  );
}
