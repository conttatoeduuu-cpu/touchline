'use client';

import { useState } from 'react';
import { Plus, Download, Trash2, Shield, Swords, Zap, Flag, Check, Save } from 'lucide-react';
import type { RecordItem } from '@/lib/domain';

type AppRecord = RecordItem<Record<string, any>>;

interface TacticsBoardProps {
  players: any[];
  records: AppRecord[];
  admin: boolean;
  save: (v: any) => Promise<void>;
  exportArt: (r: AppRecord) => void;
  remove: (r: AppRecord) => void;
  teamName: string;
}

interface FormationConfig {
  name: string;
  category: string;
  positions: { x: number; y: number; role: string; pos: string }[];
}

const FORMATIONS: Record<string, FormationConfig> = {
  '4-3-3': {
    name: '4-3-3 Ofensivo',
    category: 'Ofensivo',
    positions: [
      { x: 50, y: 14, role: 'Centroavante', pos: 'ATA' },
      { x: 18, y: 22, role: 'Ponta Esquerda', pos: 'ATA' },
      { x: 82, y: 22, role: 'Ponta Direita', pos: 'ATA' },
      { x: 50, y: 38, role: 'Meia Atacante', pos: 'MEI' },
      { x: 30, y: 52, role: 'Meia Central', pos: 'MEI' },
      { x: 70, y: 52, role: 'Meia Central', pos: 'MEI' },
      { x: 14, y: 70, role: 'Lateral Esquerdo', pos: 'DEF' },
      { x: 38, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 62, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 86, y: 70, role: 'Lateral Direito', pos: 'DEF' },
      { x: 50, y: 92, role: 'Goleiro', pos: 'GOL' },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1 Equilibrado',
    category: 'Equilibrado',
    positions: [
      { x: 50, y: 15, role: 'Centroavante', pos: 'ATA' },
      { x: 20, y: 30, role: 'Meia Esquerda', pos: 'MEI' },
      { x: 50, y: 32, role: 'Meia Atacante (CAM)', pos: 'MEI' },
      { x: 80, y: 30, role: 'Meia Direita', pos: 'MEI' },
      { x: 35, y: 52, role: 'Volante (CDM)', pos: 'MEI' },
      { x: 65, y: 52, role: 'Volante (CDM)', pos: 'MEI' },
      { x: 14, y: 70, role: 'Lateral Esquerdo', pos: 'DEF' },
      { x: 38, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 62, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 86, y: 70, role: 'Lateral Direito', pos: 'DEF' },
      { x: 50, y: 92, role: 'Goleiro', pos: 'GOL' },
    ],
  },
  '4-4-2': {
    name: '4-4-2 Clássico',
    category: 'Equilibrado',
    positions: [
      { x: 38, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 62, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 15, y: 40, role: 'Meia Esquerdo', pos: 'MEI' },
      { x: 38, y: 46, role: 'Meia Central', pos: 'MEI' },
      { x: 62, y: 46, role: 'Meia Central', pos: 'MEI' },
      { x: 85, y: 40, role: 'Meia Direito', pos: 'MEI' },
      { x: 14, y: 70, role: 'Lateral Esquerdo', pos: 'DEF' },
      { x: 38, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 62, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 86, y: 70, role: 'Lateral Direito', pos: 'DEF' },
      { x: 50, y: 92, role: 'Goleiro', pos: 'GOL' },
    ],
  },
  '3-5-2': {
    name: '3-5-2 Ofensivo',
    category: 'Ofensivo',
    positions: [
      { x: 38, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 62, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 12, y: 42, role: 'Ala Esquerdo', pos: 'MEI' },
      { x: 36, y: 48, role: 'Meia Central', pos: 'MEI' },
      { x: 50, y: 34, role: 'Meia Atacante', pos: 'MEI' },
      { x: 64, y: 48, role: 'Meia Central', pos: 'MEI' },
      { x: 88, y: 42, role: 'Ala Direito', pos: 'MEI' },
      { x: 26, y: 73, role: 'Zagueiro Esquerdo', pos: 'DEF' },
      { x: 50, y: 76, role: 'Líbero / Zagueiro Central', pos: 'DEF' },
      { x: 74, y: 73, role: 'Zagueiro Direito', pos: 'DEF' },
      { x: 50, y: 92, role: 'Goleiro', pos: 'GOL' },
    ],
  },
  '5-3-2': {
    name: '5-3-2 Contra-Ataque',
    category: 'Defensivo',
    positions: [
      { x: 38, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 62, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 30, y: 46, role: 'Meia Central', pos: 'MEI' },
      { x: 50, y: 42, role: 'Meia / Volante', pos: 'MEI' },
      { x: 70, y: 46, role: 'Meia Central', pos: 'MEI' },
      { x: 12, y: 68, role: 'Ala Esquerdo', pos: 'DEF' },
      { x: 32, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 50, y: 76, role: 'Zagueiro Central', pos: 'DEF' },
      { x: 68, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 88, y: 68, role: 'Ala Direito', pos: 'DEF' },
      { x: 50, y: 92, role: 'Goleiro', pos: 'GOL' },
    ],
  },
  '4-2-2-2': {
    name: '4-2-2-2 Pressão e Linhas Curtas',
    category: 'Ofensivo',
    positions: [
      { x: 38, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 62, y: 16, role: 'Atacante', pos: 'ATA' },
      { x: 25, y: 34, role: 'Meia Atacante Aberto', pos: 'MEI' },
      { x: 75, y: 34, role: 'Meia Atacante Aberto', pos: 'MEI' },
      { x: 38, y: 54, role: 'Volante', pos: 'MEI' },
      { x: 62, y: 54, role: 'Volante', pos: 'MEI' },
      { x: 14, y: 70, role: 'Lateral Esquerdo', pos: 'DEF' },
      { x: 38, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 62, y: 74, role: 'Zagueiro', pos: 'DEF' },
      { x: 86, y: 70, role: 'Lateral Direito', pos: 'DEF' },
      { x: 50, y: 92, role: 'Goleiro', pos: 'GOL' },
    ],
  },
};

export function TacticsBoard({
  players,
  records,
  admin,
  save,
  exportArt,
  remove,
  teamName,
}: TacticsBoardProps) {
  const [selectedFormation, setSelectedFormation] = useState<string>('4-3-3');
  const [name, setName] = useState('Escalação Titular');
  const [slots, setSlots] = useState<string[]>(Array(11).fill(''));
  const [styleDef, setStyleDef] = useState('Pressão após perda');
  const [styleOff, setStyleOff] = useState('Construção rápida');
  const [captain, setCaptain] = useState('');
  const [penalties, setPenalties] = useState('');
  const [freeKicks, setFreeKicks] = useState('');
  const [corners, setCorners] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const currentCfg = FORMATIONS[selectedFormation] || FORMATIONS['4-3-3'];

  function loadLineup(r: AppRecord) {
    const data = r.data;
    if (data.formation && FORMATIONS[data.formation]) {
      setSelectedFormation(data.formation);
    }
    setName(data.name || 'Escalação Carregada');
    if (Array.isArray(data.slots)) {
      setSlots(data.slots.map((s: any) => (typeof s === 'string' ? s : s?.id ?? '')));
    }
    if (data.styleDef) setStyleDef(data.styleDef);
    if (data.styleOff) setStyleOff(data.styleOff);
    if (data.captain) setCaptain(data.captain);
    if (data.penalties) setPenalties(data.penalties);
    if (data.freeKicks) setFreeKicks(data.freeKicks);
    if (data.corners) setCorners(data.corners);
  }

  async function handleSave() {
    try {
      setErr('');
      if (!name.trim()) throw new Error('Dê um nome para a prancheta tática.');
      const chosen = slots.filter(Boolean);
      if (new Set(chosen).size !== chosen.length) {
        throw new Error('Um jogador não pode estar escalado em duas posições ao mesmo tempo.');
      }
      setBusy(true);
      await save({
        name,
        formation: selectedFormation,
        slots: slots.map((id, i) => ({
          id,
          name: players.find((p) => p.id === id)?.name ?? '—',
          pos: currentCfg.positions[i]?.pos ?? '',
          role: currentCfg.positions[i]?.role ?? '',
        })),
        styleDef,
        styleOff,
        captain,
        penalties,
        freeKicks,
        corners,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tactics-container">
      {/* Barra de Seleção Tática do Topo */}
      <div className="tactics-top-panel">
        <div className="tactics-title-box">
          <h2>Prancheta Tática Profissional</h2>
          <p>Monte o esquema tático, defina instruções de jogo e escale seu 11 titular.</p>
        </div>

        <div className="tactics-formation-selector">
          <label>ESQUEMA TÁTICO:</label>
          <select
            value={selectedFormation}
            onChange={(e) => setSelectedFormation(e.target.value)}
            aria-label="Escolher Formação Tática"
          >
            {Object.entries(FORMATIONS).map(([key, cfg]) => (
              <option key={key} value={key}>
                {key} • {cfg.name} ({cfg.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tactics-grid">
        {/* O CAMPO DE FUTEBOL INTERATIVO */}
        <div className="pitch-wrapper">
          <div className="pitch-header-info">
            <span className="pitch-formation-pill">{selectedFormation}</span>
            <span className="pitch-team-name">{teamName}</span>
          </div>

          <div className="soccer-pitch">
            {/* Linhas e Marcações Oficiais do Campo */}
            <div className="pitch-box-top" />
            <div className="pitch-arc-top" />
            <div className="pitch-half-line" />
            <div className="pitch-center-circle" />
            <div className="pitch-center-spot" />
            <div className="pitch-box-bottom" />
            <div className="pitch-arc-bottom" />

            {/* Tokens dos Atletas no Campo */}
            {currentCfg.positions.map((slot, idx) => {
              const assignedPlayer = players.find((p) => p.id === slots[idx]);
              const isCap = assignedPlayer && captain === assignedPlayer.id;

              return (
                <div
                  key={idx}
                  className="tactical-token"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                >
                  <div className={`token-badge pos-${slot.pos.toLowerCase()}`}>
                    <span className="token-pos">{slot.pos}</span>
                    {isCap && <span className="token-captain-badge">C</span>}
                  </div>

                  <div className="token-info-box">
                    <span className="token-role">{slot.role}</span>
                    {admin ? (
                      <select
                        aria-label={`Escalar para ${slot.role}`}
                        value={slots[idx] ?? ''}
                        onChange={(e) =>
                          setSlots(slots.map((val, sIdx) => (sIdx === idx ? e.target.value : val)))
                        }
                      >
                        <option value="">(Vago)</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.position ? `(${p.position})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <b className="token-player-name">
                        {assignedPlayer ? assignedPlayer.name : '(A definir)'}
                      </b>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PAINEL LATERAL: ESTRATÉGIA, BATEDORES E SALVAMENTO */}
        <div className="tactics-sidebar">
          {/* Instruções de Jogo */}
          <div className="tactics-card">
            <h3>Instruções de Estratégia</h3>
            <div className="tactics-field">
              <label>Estilo Defensivo</label>
              {admin ? (
                <select value={styleDef} onChange={(e) => setStyleDef(e.target.value)}>
                  <option>Pressão após perda</option>
                  <option>Pressão alta constante</option>
                  <option>Equilibrado</option>
                  <option>Recuado / Compacto</option>
                  <option>Linhas de impedimento</option>
                </select>
              ) : (
                <p className="strategy-val">{styleDef}</p>
              )}
            </div>

            <div className="tactics-field">
              <label>Criação & Ataque</label>
              {admin ? (
                <select value={styleOff} onChange={(e) => setStyleOff(e.target.value)}>
                  <option>Construção rápida</option>
                  <option>Posse de bola paciente</option>
                  <option>Transição em velocidade</option>
                  <option>Lançamentos longos / Pivô</option>
                </select>
              ) : (
                <p className="strategy-val">{styleOff}</p>
              )}
            </div>
          </div>

          {/* Batedores e Funções */}
          <div className="tactics-card">
            <h3>Batedores & Liderança</h3>
            <div className="tactics-field">
              <label>Capitão em Campo</label>
              {admin ? (
                <select value={captain} onChange={(e) => setCaptain(e.target.value)}>
                  <option value="">Escolha o Capitão</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="strategy-val">
                  {players.find((p) => p.id === captain)?.name || '—'}
                </p>
              )}
            </div>

            <div className="tactics-field">
              <label>Pênaltis</label>
              {admin ? (
                <select value={penalties} onChange={(e) => setPenalties(e.target.value)}>
                  <option value="">Batedor de Pênalti</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="strategy-val">
                  {players.find((p) => p.id === penalties)?.name || '—'}
                </p>
              )}
            </div>

            <div className="tactics-field">
              <label>Faltas & Escanteios</label>
              {admin ? (
                <select value={freeKicks} onChange={(e) => setFreeKicks(e.target.value)}>
                  <option value="">Batedor Oficial</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="strategy-val">
                  {players.find((p) => p.id === freeKicks)?.name || '—'}
                </p>
              )}
            </div>
          </div>

          {/* Salvar Prancheta (Diretoria) */}
          {admin && (
            <div className="tactics-card save-card">
              <h3>Salvar Esquema</h3>
              <div className="tactics-field">
                <label>Nome do Esquema Tático</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Titular 4-3-3 Ofensivo"
                />
              </div>
              {err && <p className="tactics-err">{err}</p>}
              <button
                className="button primary full-width"
                disabled={busy}
                onClick={handleSave}
              >
                <Save size={16} />
                {busy ? 'Salvando…' : 'Salvar Prancheta'}
              </button>
            </div>
          )}

          {/* Lista de Esquemas Salvos */}
          <div className="tactics-card">
            <h3>Pranchetas Salvas ({records.length})</h3>
            <div className="saved-lineups-list">
              {records.map((r) => (
                <div key={r.id} className="saved-lineup-item">
                  <div>
                    <b>{r.data.name}</b>
                    <small>
                      {r.data.formation} • {r.data.styleDef || 'Padrão'}
                    </small>
                  </div>
                  <div className="saved-actions">
                    <button
                      className="button small"
                      onClick={() => loadLineup(r)}
                      title="Carregar no campo"
                    >
                      Carregar
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => exportArt(r)}
                      title="Exportar Imagem"
                    >
                      <Download size={14} />
                    </button>
                    {admin && (
                      <button
                        className="icon-button"
                        onClick={() => remove(r)}
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!records.length && (
                <p className="muted-empty">Nenhum esquema tático salvo ainda.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
