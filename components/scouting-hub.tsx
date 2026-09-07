'use client';

import { useState, useMemo } from 'react';
import { Target, Search, Plus, Download, Sparkles, Shield, Trophy, ExternalLink, Image as ImageIcon, Trash2 } from 'lucide-react';
import type { Match, RecordItem } from '@/lib/domain';

type AppRecord = RecordItem<Record<string, any>>;

interface ScoutingHubProps {
  matches: Match[];
  records: AppRecord[];
  admin: boolean;
  team: string;
  onAnalyze: (id: string) => Promise<void>;
  onCreateReport: (values: any) => Promise<void>;
  onSaveOpponentLogo?: (opponentName: string, logoUrl: string) => Promise<void>;
  onRemoveRecord: (r: AppRecord) => Promise<void>;
}

const fmt = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: dec });

const dateFormatted = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export function ScoutingHub({
  matches,
  records,
  admin,
  team,
  onAnalyze,
  onCreateReport,
  onSaveOpponentLogo,
  onRemoveRecord,
}: ScoutingHubProps) {
  const [query, setQuery] = useState('');
  const [modalReport, setModalReport] = useState<AppRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formClubId, setFormClubId] = useState('');
  const [editingLogoOpponent, setEditingLogoOpponent] = useState<string | null>(null);
  const [logoInput, setLogoInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Relatórios de scout salvos
  const scoutReports = useMemo(
    () => records.filter((r) => r.kind === 'scout'),
    [records]
  );

  // Logos de adversários salvas
  const logoRecords = useMemo(
    () => records.filter((r) => r.kind === 'team_logo'),
    [records]
  );

  const getOpponentLogo = (name: string) => {
    const found = logoRecords.find(
      (r) => r.data.clubName?.toLowerCase() === name.toLowerCase()
    );
    return found?.data.logoUrl || null;
  };

  // Rivais enfrentados no histórico da nossa base de dados
  const rivalClubs = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of matches) {
      if (m.excluded || !m.opponent) continue;
      const existing = map.get(m.opponent) ?? {
        name: m.opponent,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        lastMatch: m.playedAt,
        sampleMatch: m,
      };
      existing.games += 1;
      if (m.goalsFor > m.goalsAgainst) existing.wins += 1;
      else if (m.goalsFor === m.goalsAgainst) existing.draws += 1;
      else existing.losses += 1;
      existing.gf += m.goalsFor;
      existing.ga += m.goalsAgainst;
      map.set(m.opponent, existing);
    }
    return [...map.values()].sort((a, b) => b.games - a.games);
  }, [matches]);

  const filteredRivals = useMemo(() => {
    if (!query.trim()) return rivalClubs;
    return rivalClubs.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  }, [rivalClubs, query]);

  async function handleCreate() {
    try {
      setErr('');
      if (!formClubId.trim()) throw new Error('Informe o ID do clube na EA.');
      setBusy(true);
      await onCreateReport({
        name: formName || `Clube ${formClubId}`,
        clubId: formClubId.trim(),
      });
      setIsCreating(false);
      setFormName('');
      setFormClubId('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLogo() {
    if (!editingLogoOpponent || !onSaveOpponentLogo) return;
    setBusy(true);
    try {
      await onSaveOpponentLogo(editingLogoOpponent, logoInput.trim());
      setEditingLogoOpponent(null);
      setLogoInput('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scouting-container">
      {/* CABEÇALHO LIMPO DO SCOUTING */}
      <div className="scouting-header-box">
        <div className="scouting-title-wrap">
          <h2>Centro de Inteligência de Adversários (Scouting)</h2>
          <p>
            Relatórios táticos de rivais, histórico de confrontos e análise de perigo para os
            próximos jogos.
          </p>
        </div>

        {admin && (
          <button className="button primary" onClick={() => setIsCreating(true)}>
            <Plus size={16} /> Novo Relatório por ID
          </button>
        )}
      </div>

      {/* RELATÓRIOS SALVOS / EM ANDAMENTO */}
      {scoutReports.length > 0 && (
        <div className="scouting-saved-section">
          <h3>Relatórios Táticos Cadastrados ({scoutReports.length})</h3>
          <div className="scout-cards-grid">
            {scoutReports.map((r) => (
              <div key={r.id} className="scout-report-card">
                <div className="scout-report-top">
                  <div className="scout-badge-icon">
                    <Target size={20} />
                  </div>
                  <div>
                    <h4>{r.data.name}</h4>
                    <span className="scout-date">{dateFormatted(r.createdAt)}</span>
                  </div>
                </div>

                <p className="scout-summary-text">{r.data.summary || 'Aguardando dados da EA.'}</p>

                {r.data.aiAnalysis && (
                  <div className="scout-ai-badge">
                    <Sparkles size={12} /> ANÁLISE IA TÁTICA DISPONÍVEL
                  </div>
                )}

                <div className="scout-card-actions">
                  <button className="button small" onClick={() => setModalReport(r)}>
                    Abrir Dossiê
                  </button>
                  {admin && (
                    <button
                      className="icon-button"
                      onClick={() => onRemoveRecord(r)}
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RADAR DE RIVAIS ENFRENTADOS (COM OPÇÃO DE LOGO PARA A DIRETORIA) */}
      <div className="scouting-rivals-section">
        <div className="section-title-bar">
          <div>
            <h3>Clubes Enfrentados & Dossiê de Confronto</h3>
            <p>Gerencie logos, veja o histórico e analise pontos fortes dos rivais.</p>
          </div>
          <div className="rival-search-box">
            <Search size={15} />
            <input
              placeholder="Buscar adversário..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="rivals-grid">
          {filteredRivals.map((riv) => {
            const logo = getOpponentLogo(riv.name);

            return (
              <div key={riv.name} className="rival-card">
                <div className="rival-card-top">
                  <div className="rival-logo-frame">
                    {logo ? (
                      <img src={logo} alt={riv.name} />
                    ) : (
                      <span className="rival-mono">{riv.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="rival-info">
                    <h4>{riv.name}</h4>
                    <span className="rival-games-tag">{riv.games} confronto{riv.games > 1 ? 's' : ''}</span>
                  </div>

                  {admin && (
                    <button
                      className="icon-button"
                      title="Alterar/Adicionar Logo"
                      onClick={() => {
                        setEditingLogoOpponent(riv.name);
                        setLogoInput(logo || '');
                      }}
                    >
                      <ImageIcon size={15} />
                    </button>
                  )}
                </div>

                <div className="rival-h2h-strip">
                  <div className="h2h-stat">
                    <span>VITÓRIAS</span>
                    <b className="c-v">{riv.wins}</b>
                  </div>
                  <div className="h2h-stat">
                    <span>EMPATES</span>
                    <b className="c-e">{riv.draws}</b>
                  </div>
                  <div className="h2h-stat">
                    <span>DERROTAS</span>
                    <b className="c-d">{riv.losses}</b>
                  </div>
                  <div className="h2h-stat">
                    <span>GOLS</span>
                    <b>{riv.gf}:{riv.ga}</b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL PARA ADICIONAR NOVO RELATÓRIO POR ID */}
      {isCreating && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog">
            <header>
              <h2>Novo Relatório de Scouting</h2>
              <button className="icon-button" onClick={() => setIsCreating(false)}>
                ✕
              </button>
            </header>
            <div className="data-form">
              <label>
                Nome do Adversário (Opcional)
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Ressaca ES"
                />
              </label>
              <label>
                ID Oficial do Clube na EA (Obrigatório)
                <input
                  value={formClubId}
                  onChange={(e) => setFormClubId(e.target.value)}
                  placeholder="Ex: 184419"
                  required
                />
              </label>
              {err && <p className="error-text">{err}</p>}
              <div className="actions">
                <button className="button primary" disabled={busy} onClick={handleCreate}>
                  {busy ? 'Buscando dados na EA…' : 'Criar Relatório'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA DIRETORIA DEFINIR LOGO DO ADVERSÁRIO */}
      {editingLogoOpponent && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog">
            <header>
              <h2>Escudo do Adversário • {editingLogoOpponent}</h2>
              <button className="icon-button" onClick={() => setEditingLogoOpponent(null)}>
                ✕
              </button>
            </header>
            <div className="data-form">
              <label>
                URL HTTPS da Imagem do Escudo / Logo
                <input
                  type="url"
                  value={logoInput}
                  onChange={(e) => setLogoInput(e.target.value)}
                  placeholder="https://exemplo.com/escudo.png"
                  required
                />
                <small>Insira o link direto de uma imagem PNG ou JPEG na internet.</small>
              </label>

              <div className="actions">
                <button className="button primary" disabled={busy} onClick={handleSaveLogo}>
                  {busy ? 'Salvando…' : 'Salvar Escudo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DO RELATÓRIO DE SCOUT */}
      {modalReport && (
        <div className="modal-backdrop">
          <div className="modal wide" role="dialog">
            <header>
              <h2>Dossiê Tático • {modalReport.data.name}</h2>
              <button className="icon-button" onClick={() => setModalReport(null)}>
                ✕
              </button>
            </header>

            <div className="scout-dossier-body">
              <p className="scout-dossier-summary">{modalReport.data.summary}</p>

              {modalReport.data.aiAnalysis && (
                <div className="ai-analysis-pro">
                  <div className="ai-header">
                    <Sparkles size={16} />
                    <b>Análise Tática Assistida por Inteligência Artificial</b>
                  </div>
                  <p>{modalReport.data.aiAnalysis}</p>
                </div>
              )}

              {admin && !modalReport.data.aiAnalysis && (
                <button
                  className="button"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onAnalyze(modalReport.id);
                      setModalReport(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Sparkles size={15} /> Gerar Análise Tática com IA
                </button>
              )}

              {modalReport.data.matches && (
                <div className="scout-recent-matches">
                  <h4>Últimas Partidas Registradas do Adversário</h4>
                  {modalReport.data.matches.map((m: Match) => (
                    <div key={m.id} className="list-row">
                      <span>{dateFormatted(m.playedAt)}</span>
                      <b>vs {m.opponent}</b>
                      <strong>
                        {m.goalsFor} × {m.goalsAgainst}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
