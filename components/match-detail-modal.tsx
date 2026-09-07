'use client';

import { useState, useMemo } from 'react';
import { Trophy, CalendarDays, MapPin, Download, Film, Pencil, EyeOff, Eye, Share2, Check, Star } from 'lucide-react';
import { TEAMS, type TeamId, type Match, type PlayerLine, result } from '@/lib/domain';

const fmt = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: dec });

const dateFormatted = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function cleanPos(pos: string) {
  const p = (pos ?? '').toLowerCase();
  if (p.includes('goal') || p === 'gk') return { label: 'GOL', cls: 'pos-gk' };
  if (p.includes('def') || ['cb', 'lb', 'rb', 'lwb', 'rwb'].includes(p)) return { label: 'DEF', cls: 'pos-def' };
  if (p.includes('mid') || ['cdm', 'cm', 'cam', 'lm', 'rm'].includes(p)) return { label: 'MEI', cls: 'pos-mid' };
  if (p.includes('for') || p.includes('att') || ['st', 'cf', 'lw', 'rw'].includes(p)) return { label: 'ATA', cls: 'pos-att' };
  return { label: pos ? pos.toUpperCase().slice(0, 3) : '—', cls: 'pos-gen' };
}

function ratingColor(r: number | null) {
  if (r === null || r === undefined) return '';
  if (r >= 8.5) return 'rating-elite';
  if (r >= 7.5) return 'rating-high';
  if (r >= 6.5) return 'rating-med';
  return 'rating-low';
}

function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  match: Match;
  team: TeamId;
  brand: { name: string; short: string; accent: string; logo: string };
  settings: any;
  admin: boolean;
  opponentLogo?: string;
  onSaveOpponentLogo?: (opponentName: string, logoUrl: string) => Promise<void>;
  onClose: () => void;
  onEdit?: (m: Match) => void;
  onSaveImage: (kind: string, m: Match) => void;
  onToggleExclude?: (m: Match) => Promise<void>;
  onDiscord?: (m: Match) => Promise<void>;
}

export function MatchDetailModal({
  match,
  team,
  brand,
  settings,
  admin,
  opponentLogo,
  onSaveOpponentLogo,
  onClose,
  onEdit,
  onSaveImage,
  onToggleExclude,
  onDiscord,
}: Props) {
  const [tab, setTab] = useState<'all' | 'own' | 'opp'>('all');
  const [toggling, setToggling] = useState(false);

  // Informações extras dos clubes via raw da EA
  const raw = match.raw as any;
  const clubs = raw?.clubs ?? {};
  const clubIds = Object.keys(clubs);
  const usId = clubIds.find((id) => id === settings?.clubId) ?? clubIds[0];
  const oppId = clubIds.find((id) => id !== usId);

  const usClub = clubs[usId];
  const oppClub = clubs[oppId ?? ''];

  const stadium =
    usClub?.details?.customKit?.stadName ||
    oppClub?.details?.customKit?.stadName ||
    null;

  const opponentRealName = oppClub?.details?.name || match.opponent || 'Adversário';
  const opponentShort = oppClub?.details?.name
    ? oppClub.details.name
        .split(/\s+/)
        .map((w: string) => w[0])
        .join('')
        .slice(0, 3)
        .toUpperCase()
    : 'ADV';

  // Jogadores separados
  const ownPlayers = useMemo(() => match.players.filter((p) => p.own), [match.players]);
  const oppPlayers = useMemo(() => match.players.filter((p) => !p.own), [match.players]);

  // Lista a exibir conforme a aba
  const displayedPlayers = useMemo(() => {
    if (tab === 'own') return ownPlayers;
    if (tab === 'opp') return oppPlayers;
    return match.players;
  }, [tab, ownPlayers, oppPlayers, match.players]);

  // Craque da Partida (MVP / Man of the Match)
  const mvp = useMemo(() => {
    if (!match.players.length) return null;
    return [...match.players].sort((a, b) => {
      const aMotm = a.motm || (a.raw as any)?.mom === '1';
      const bMotm = b.motm || (b.raw as any)?.mom === '1';
      if (aMotm && !bMotm) return -1;
      if (!aMotm && bMotm) return 1;
      return (b.rating ?? 0) - (a.rating ?? 0);
    })[0];
  }, [match.players]);

  // Estatísticas comparativas da equipe
  const stats = useMemo(() => {
    const calc = (list: PlayerLine[]) => {
      const shots = list.reduce((n, p) => n + (p.shots ?? 0), 0);
      const passesMade = list.reduce((n, p) => n + (p.passes ?? 0), 0);
      const passAtt = list.reduce((n, p) => n + (p.passAttempts ?? 0), 0);
      const passPct = passAtt ? Math.round((passesMade / passAtt) * 100) : null;
      const tacklesMade = list.reduce((n, p) => n + (p.tackles ?? 0), 0);
      const tackleAtt = list.reduce((n, p) => n + (p.tackleAttempts ?? 0), 0);
      const tacklePct = tackleAtt ? Math.round((tacklesMade / tackleAtt) * 100) : null;
      const saves = list.reduce((n, p) => n + (p.saves ?? 0), 0);
      return { shots, passesMade, passAtt, passPct, tacklesMade, tackleAtt, tacklePct, saves };
    };

    return {
      own: calc(ownPlayers),
      opp: calc(oppPlayers),
    };
  }, [ownPlayers, oppPlayers]);

  const outcome = result(match);
  const outcomeLabel = outcome === 'V' ? 'VITÓRIA' : outcome === 'D' ? 'DERROTA' : 'EMPATE';

  const typeLabel = (t: string) =>
    ({
      leagueMatch: 'Partida de Liga',
      friendlyMatch: 'Amistoso',
      playoffMatch: 'Playoffs',
      manual: 'Manual',
      globalpro: 'GlobalPro Oficial',
    }[t] ?? t);

  return (
    <div className="modal-backdrop">
      <section className="modal wide match-modal-pro" role="dialog" aria-modal="true" aria-label="Detalhes da Partida">
        {/* Top bar com metadados */}
        <div className="match-meta-bar">
          <div className="match-meta-left">
            <span className="match-type-pill">{typeLabel(match.type)}</span>
            {match.competition && <span className="match-comp-pill">{match.competition}</span>}
            <span className="match-time-pill">
              <CalendarDays size={13} />
              {dateFormatted(match.playedAt)}
            </span>
            {stadium && (
              <span className="match-stadium-pill">
                <MapPin size={13} />
                {stadium}
              </span>
            )}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {/* HERO SCOREBOARD */}
        <div className="match-scoreboard">
          {/* Time da Casa / Nosso Clube */}
          <div className="match-team-side our-side">
            <div className="team-crest-box">
              <img src={settings?.logo || brand.logo} alt={brand.name} />
            </div>
            <div className="team-text">
              <h3>{brand.name}</h3>
              <span className="team-subtag">{brand.short} · MANDANTE</span>
            </div>
          </div>

          {/* Placar Central */}
          <div className="match-score-center">
            <div className="score-numbers">
              <span className="score-for">{match.goalsFor}</span>
              <span className="score-sep">:</span>
              <span className="score-against">{match.goalsAgainst}</span>
            </div>
            <div className={`match-badge-outcome ${outcome}`}>
              {outcomeLabel}
            </div>
            {match.excluded && (
              <span className="excluded-warn-badge">⚠️ Desconsiderada das Estatísticas</span>
            )}
          </div>

          {/* Time Visitante / Adversário */}
          <div className="match-team-side opp-side">
            <div className="team-text text-right">
              <h3>{opponentRealName}</h3>
              <span className="team-subtag">{opponentShort} · ADVERSÁRIO</span>
            </div>
            <div className="team-crest-box opp-crest" style={{ position: 'relative' }}>
              {opponentLogo ? (
                <img src={opponentLogo} alt={opponentRealName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <span>{opponentRealName.slice(0, 2).toUpperCase()}</span>
              )}
              {admin && onSaveOpponentLogo && (
                <button
                  type="button"
                  title="Definir escudo do adversário"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = window.prompt(`URL HTTPS do escudo para ${opponentRealName}:`, opponentLogo || '');
                    if (url && url.startsWith('http')) {
                      void onSaveOpponentLogo(opponentRealName, url);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    bottom: -6,
                    right: -6,
                    background: '#1a1f1b',
                    border: '1px solid var(--accent, #10b981)',
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    cursor: 'pointer',
                    color: '#fff',
                  }}
                >
                  ✎
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CRAQUE DO JOGO (MVP) */}
        {mvp && (mvp.rating ?? 0) >= 7.0 && (
          <div className="match-mvp-card">
            <div className="mvp-left">
              <div className="mvp-trophy-badge">
                <Trophy size={18} />
              </div>
              <div>
                <span className="mvp-label">CRAQUE DA PARTIDA (MVP)</span>
                <h4 className="mvp-name">{mvp.name}</h4>
                <small className="mvp-club-name">
                  {mvp.own ? brand.name : opponentRealName} · {cleanPos(mvp.position).label}
                </small>
              </div>
            </div>
            <div className="mvp-stats-quick">
              {mvp.goals ? <span className="mvp-stat-pill">⚽ {mvp.goals} gol{mvp.goals > 1 ? 's' : ''}</span> : null}
              {mvp.assists ? <span className="mvp-stat-pill">👟 {mvp.assists} assist.</span> : null}
              {mvp.passes !== null && mvp.passAttempts ? (
                <span className="mvp-stat-pill">
                  🎯 {mvp.passes}/{mvp.passAttempts} ({Math.round((mvp.passes / mvp.passAttempts) * 100)}% passes)
                </span>
              ) : null}
              {mvp.tackles ? <span className="mvp-stat-pill">🛡️ {mvp.tackles} desarmes</span> : null}
              {mvp.saves ? <span className="mvp-stat-pill">🧤 {mvp.saves} defesas</span> : null}
              <div className="mvp-rating-box">
                <small>NOTA</small>
                <strong>{fmt(mvp.rating, 1)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* COMPARATIVO DE ESTATÍSTICAS DA PARTIDA (TEAM STATS) */}
        {(stats.own.shots > 0 || stats.opp.shots > 0 || stats.own.passesMade > 0) && (
          <div className="match-team-comparison">
            <div className="comparison-header">
              <span>{brand.short}</span>
              <h5>ESTATÍSTICAS DA PARTIDA</h5>
              <span>{opponentShort}</span>
            </div>

            <div className="comparison-rows">
              {/* Gols */}
              <div className="comparison-row">
                <b className="val-left">{match.goalsFor}</b>
                <div className="bar-track">
                  <div
                    className="bar-fill-left"
                    style={{
                      width: `${(match.goalsFor / Math.max(1, match.goalsFor + match.goalsAgainst)) * 100}%`,
                    }}
                  />
                  <span className="bar-label">Gols</span>
                  <div
                    className="bar-fill-right"
                    style={{
                      width: `${(match.goalsAgainst / Math.max(1, match.goalsFor + match.goalsAgainst)) * 100}%`,
                    }}
                  />
                </div>
                <b className="val-right">{match.goalsAgainst}</b>
              </div>

              {/* Chutes */}
              <div className="comparison-row">
                <span className="val-left">{stats.own.shots}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill-left"
                    style={{
                      width: `${(stats.own.shots / Math.max(1, stats.own.shots + stats.opp.shots)) * 100}%`,
                    }}
                  />
                  <span className="bar-label">Finalizações</span>
                  <div
                    className="bar-fill-right"
                    style={{
                      width: `${(stats.opp.shots / Math.max(1, stats.own.shots + stats.opp.shots)) * 100}%`,
                    }}
                  />
                </div>
                <span className="val-right">{stats.opp.shots}</span>
              </div>

              {/* Passes */}
              <div className="comparison-row">
                <span className="val-left">
                  {stats.own.passPct !== null ? `${stats.own.passPct}%` : '—'}
                  <small>({stats.own.passesMade}/{stats.own.passAtt})</small>
                </span>
                <div className="bar-track">
                  <div
                    className="bar-fill-left"
                    style={{ width: `${stats.own.passPct ?? 50}%` }}
                  />
                  <span className="bar-label">Precisão de Passe</span>
                  <div
                    className="bar-fill-right"
                    style={{ width: `${stats.opp.passPct ?? 50}%` }}
                  />
                </div>
                <span className="val-right">
                  <small>({stats.opp.passesMade}/{stats.opp.passAtt})</small>
                  {stats.opp.passPct !== null ? `${stats.opp.passPct}%` : '—'}
                </span>
              </div>

              {/* Desarmes */}
              <div className="comparison-row">
                <span className="val-left">
                  {stats.own.tacklePct !== null ? `${stats.own.tacklePct}%` : '—'}
                  <small>({stats.own.tacklesMade}/{stats.own.tackleAtt})</small>
                </span>
                <div className="bar-track">
                  <div
                    className="bar-fill-left"
                    style={{ width: `${stats.own.tacklePct ?? 50}%` }}
                  />
                  <span className="bar-label">Eficiência nos Desarmes</span>
                  <div
                    className="bar-fill-right"
                    style={{ width: `${stats.opp.tacklePct ?? 50}%` }}
                  />
                </div>
                <span className="val-right">
                  <small>({stats.opp.tacklesMade}/{stats.opp.tackleAtt})</small>
                  {stats.opp.tacklePct !== null ? `${stats.opp.tacklePct}%` : '—'}
                </span>
              </div>

              {/* Defesas de Goleiro */}
              {(stats.own.saves > 0 || stats.opp.saves > 0) && (
                <div className="comparison-row">
                  <span className="val-left">{stats.own.saves}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill-left"
                      style={{
                        width: `${(stats.own.saves / Math.max(1, stats.own.saves + stats.opp.saves)) * 100}%`,
                      }}
                    />
                    <span className="bar-label">Defesas do Goleiro</span>
                    <div
                      className="bar-fill-right"
                      style={{
                        width: `${(stats.opp.saves / Math.max(1, stats.own.saves + stats.opp.saves)) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="val-right">{stats.opp.saves}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABAS DO ELENCO */}
        <div className="match-players-tabs-bar">
          <div className="tabs-pill-group">
            <button
              className={`tab-pill ${tab === 'all' ? 'active' : ''}`}
              onClick={() => setTab('all')}
            >
              Todos em campo ({match.players.length})
            </button>
            <button
              className={`tab-pill ${tab === 'own' ? 'active' : ''}`}
              onClick={() => setTab('own')}
            >
              🛡️ {brand.name} ({ownPlayers.length})
            </button>
            <button
              className={`tab-pill ${tab === 'opp' ? 'active' : ''}`}
              onClick={() => setTab('opp')}
            >
              ⚔️ {opponentRealName} ({oppPlayers.length})
            </button>
          </div>
        </div>

        {/* TABELA DE SCOUT DE JOGADORES */}
        <div className="table-wrap match-pro-table">
          <table>
            <thead>
              <tr>
                <th>Jogador</th>
                <th>Equipe</th>
                <th>Posição</th>
                <th>Tempo</th>
                <th>Gols</th>
                <th>Assist.</th>
                <th>Chutes</th>
                <th>Passes (Acerto)</th>
                <th>Desarmes</th>
                <th>Defesas</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {displayedPlayers.map((p) => {
                const pos = cleanPos(p.position);
                const isPlayerMvp = p.id === mvp?.id && (p.rating ?? 0) >= 7.0;
                const passAcc = p.passAttempts ? Math.round(((p.passes ?? 0) / p.passAttempts) * 100) : null;
                const tackleAcc = p.tackleAttempts ? Math.round(((p.tackles ?? 0) / p.tackleAttempts) * 100) : null;

                return (
                  <tr key={`${p.clubId}:${p.id}`} className={isPlayerMvp ? 'row-mvp' : ''}>
                    {/* Jogador */}
                    <td>
                      <div className="player-cell">
                        <div className={`avatar-badge ${p.own ? 'own' : 'opp'}`}>
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="player-names">
                          <b>{p.name}</b>
                          {isPlayerMvp && (
                            <span className="mvp-star-tag">
                              <Star size={10} fill="#f59e0b" color="#f59e0b" /> CRAQUE
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Clube */}
                    <td>
                      <span className={`club-pill ${p.own ? 'club-own' : 'club-opp'}`}>
                        {p.own ? brand.short : opponentShort}
                      </span>
                    </td>

                    {/* Posição */}
                    <td>
                      <span className={`pos-tag ${pos.cls}`}>{pos.label}</span>
                    </td>

                    {/* Minutos */}
                    <td>
                      <span className="time-tag">
                        {p.seconds ? `${Math.round(p.seconds / 60)}'` : '90\''}
                      </span>
                    </td>

                    {/* Gols */}
                    <td>
                      {p.goals && p.goals > 0 ? (
                        <span className="stat-highlight goal">⚽ {p.goals}</span>
                      ) : (
                        <span className="muted-zero">0</span>
                      )}
                    </td>

                    {/* Assistências */}
                    <td>
                      {p.assists && p.assists > 0 ? (
                        <span className="stat-highlight assist">👟 {p.assists}</span>
                      ) : (
                        <span className="muted-zero">0</span>
                      )}
                    </td>

                    {/* Chutes */}
                    <td>
                      <span className="stat-simple">{p.shots ?? 0}</span>
                    </td>

                    {/* Passes */}
                    <td>
                      <div className="accuracy-cell">
                        <span>{p.passes ?? 0}/{p.passAttempts ?? 0}</span>
                        {passAcc !== null && (
                          <span className={`acc-pill ${passAcc >= 85 ? 'good' : passAcc >= 70 ? 'avg' : 'low'}`}>
                            {passAcc}%
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Desarmes */}
                    <td>
                      <div className="accuracy-cell">
                        <span>{p.tackles ?? 0}/{p.tackleAttempts ?? 0}</span>
                        {tackleAcc !== null && (
                          <span className={`acc-pill ${tackleAcc >= 60 ? 'good' : tackleAcc >= 35 ? 'avg' : 'low'}`}>
                            {tackleAcc}%
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Defesas */}
                    <td>
                      <span className={p.saves && p.saves > 0 ? 'stat-highlight save' : 'muted-zero'}>
                        {p.saves ?? 0}
                      </span>
                    </td>

                    {/* Nota */}
                    <td>
                      <div className={`match-rating-badge ${ratingColor(p.rating)}`}>
                        {fmt(p.rating, 1)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!match.players.length && (
          <p className="no-players-notice">
            Partida importada sem estatísticas detalhadas de jogadores da EA.
          </p>
        )}

        {/* AÇÕES NO RODAPÉ */}
        <div className="match-modal-footer">
          <div className="footer-left">
            <button className="button" onClick={() => onSaveImage('match', match)}>
              <Download size={15} /> Exportar Arte PNG
            </button>
            {match.video && (
              <a className="button" href={match.video} target="_blank" rel="noreferrer">
                <Film size={15} /> Assistir Vídeo
              </a>
            )}
            <button
              className="button"
              onClick={() =>
                download('partida.json', JSON.stringify(match, null, 2), 'application/json')
              }
            >
              JSON Completo
            </button>
          </div>

          <div className="footer-right">
            {admin && onToggleExclude && (
              <button
                className={`button ${match.excluded ? 'primary' : 'danger'}`}
                disabled={toggling}
                onClick={async () => {
                  setToggling(true);
                  try {
                    await onToggleExclude(match);
                  } finally {
                    setToggling(false);
                  }
                }}
              >
                {match.excluded ? (
                  <>
                    <Eye size={15} /> Reconsiderar Partida
                  </>
                ) : (
                  <>
                    <EyeOff size={15} /> Desconsiderar Partida
                  </>
                )}
              </button>
            )}

            {admin && onEdit && (
              <button
                className="button primary"
                onClick={() => {
                  onEdit(match);
                  onClose();
                }}
              >
                <Pencil size={15} /> Editar Partida
              </button>
            )}

            {admin && settings?.discordConfigured && onDiscord && (
              <button
                className="button"
                onClick={() => onDiscord(match)}
              >
                <Share2 size={15} /> Enviar ao Discord
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
