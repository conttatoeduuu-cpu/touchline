'use client';

import { useMemo, useState } from 'react';
import { Target, Swords, Shield, Users, ArrowUpRight, TrendingUp, BarChart2, Flame, Award, CheckCircle2 } from 'lucide-react';
import { type Match, result } from '@/lib/domain';

interface AnalyticsCenterProps {
  matches: Match[];
  players: any[];
  teamName: string;
}

const fmt = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: dec });

const dateFormatted = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export function AnalyticsCenter({ matches, players, teamName }: AnalyticsCenterProps) {
  const [h2hFilter, setH2hFilter] = useState('');

  // Partidas válidas (sem desconsideradas)
  const validMatches = useMemo(() => matches.filter((m) => !m.excluded), [matches]);

  // Estatísticas Gerais
  const summary = useMemo(() => {
    const total = validMatches.length;
    if (!total) return null;

    const wins = validMatches.filter((m) => result(m) === 'V').length;
    const draws = validMatches.filter((m) => result(m) === 'E').length;
    const losses = validMatches.filter((m) => result(m) === 'D').length;
    const winRate = ((wins * 3 + draws) / (total * 3)) * 100;

    const gf = validMatches.reduce((acc, m) => acc + m.goalsFor, 0);
    const ga = validMatches.reduce((acc, m) => acc + m.goalsAgainst, 0);
    const cleanSheets = validMatches.filter((m) => m.goalsAgainst === 0).length;

    return {
      total,
      wins,
      draws,
      losses,
      winRate,
      gf,
      ga,
      gfPerGame: gf / total,
      gaPerGame: ga / total,
      cleanSheets,
      cleanSheetRate: (cleanSheets / total) * 100,
    };
  }, [validMatches]);

  // Estatísticas Ofensivas
  const offensive = useMemo(() => {
    const totalGoals = validMatches.reduce((acc, m) => acc + m.goalsFor, 0);
    const totalShots = players.reduce((acc, p) => acc + (p.shots ?? 0), 0);
    const conversionRate = totalShots > 0 ? (totalGoals / totalShots) * 100 : null;

    const topScorers = [...players]
      .filter((p) => p.goals && p.goals > 0)
      .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
      .slice(0, 5);

    const topAssisters = [...players]
      .filter((p) => p.assists && p.assists > 0)
      .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))
      .slice(0, 5);

    return { totalGoals, totalShots, conversionRate, topScorers, topAssisters };
  }, [validMatches, players]);

  // Estatísticas de Passe & Construção
  const passing = useMemo(() => {
    const passesMade = players.reduce((acc, p) => acc + (p.passes ?? 0), 0);
    const passAtt = players.reduce((acc, p) => acc + (p.passAttempts ?? 0), 0);
    const passAccuracy = passAtt > 0 ? (passesMade / passAtt) * 100 : null;

    // Duplas mais entrosadas (jogadores que jogaram juntos com maior aproveitamento)
    const duoMap = new Map<string, any>();
    for (const m of validMatches) {
      const own = m.players.filter((p) => p.own);
      for (let i = 0; i < own.length; i++) {
        for (let j = i + 1; j < own.length; j++) {
          const key = [own[i].id, own[j].id].sort().join('::');
          const item = duoMap.get(key) ?? {
            p1: own[i].name,
            p2: own[j].name,
            games: 0,
            wins: 0,
            gf: 0,
          };
          item.games += 1;
          if (result(m) === 'V') item.wins += 1;
          item.gf += m.goalsFor;
          duoMap.set(key, item);
        }
      }
    }

    const topDuos = [...duoMap.values()]
      .filter((d) => d.games >= 2)
      .sort((a, b) => {
        const rateA = a.wins / a.games;
        const rateB = b.wins / b.games;
        return rateB - rateA || b.games - a.games;
      })
      .slice(0, 6);

    return { passesMade, passAtt, passAccuracy, topDuos };
  }, [validMatches, players]);

  // Estatísticas Defensivas
  const defensive = useMemo(() => {
    const tacklesMade = players.reduce((acc, p) => acc + (p.tackles ?? 0), 0);
    const tackleAtt = players.reduce((acc, p) => acc + (p.tackleAttempts ?? 0), 0);
    const tackleEfficiency = tackleAtt > 0 ? (tacklesMade / tackleAtt) * 100 : null;
    const totalSaves = players.reduce((acc, p) => acc + (p.saves ?? 0), 0);

    const topTacklers = [...players]
      .filter((p) => p.tackles && p.tackles > 0)
      .sort((a, b) => (b.tackles ?? 0) - (a.tackles ?? 0))
      .slice(0, 5);

    return { tacklesMade, tackleAtt, tackleEfficiency, totalSaves, topTacklers };
  }, [players]);

  // Histórico Frente a Frente (Head-to-Head)
  const h2h = useMemo(() => {
    const oppMap = new Map<string, any>();

    for (const m of validMatches) {
      const name = m.opponent || 'Desconhecido';
      const item = oppMap.get(name) ?? {
        name,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        lastPlayed: m.playedAt,
      };

      item.games += 1;
      const res = result(m);
      if (res === 'V') item.wins += 1;
      else if (res === 'E') item.draws += 1;
      else item.losses += 1;

      item.gf += m.goalsFor;
      item.ga += m.goalsAgainst;
      if (new Date(m.playedAt) > new Date(item.lastPlayed)) {
        item.lastPlayed = m.playedAt;
      }

      oppMap.set(name, item);
    }

    return [...oppMap.values()]
      .filter((opp) => opp.name.toLowerCase().includes(h2hFilter.toLowerCase()))
      .sort((a, b) => b.games - a.games || b.wins - a.wins);
  }, [validMatches, h2hFilter]);

  if (!summary) {
    return (
      <div className="analytics-empty">
        <BarChart2 size={40} />
        <h3>Aguardando partidas para gerar análises avançadas</h3>
        <p>Após as primeiras partidas coletadas, o raio-x tático completo será exibido aqui.</p>
      </div>
    );
  }

  return (
    <div className="analytics-center-container">
      {/* CABEÇALHO COM KPIS GERAIS */}
      <div className="analytics-kpi-grid">
        {/* Aproveitamento */}
        <div className="kpi-card accent-card">
          <div className="kpi-top">
            <span>APROVEITAMENTO GERAL</span>
            <TrendingUp size={16} />
          </div>
          <div className="kpi-value-row">
            <strong>{fmt(summary.winRate, 1)}%</strong>
          </div>
          <small className="kpi-sub">
            {summary.wins}V • {summary.draws}E • {summary.losses}D em {summary.total} jogos
          </small>
        </div>

        {/* Gols Pró */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span>MÉDIA DE GOLS PRÓ</span>
            <Flame size={16} />
          </div>
          <div className="kpi-value-row">
            <strong>{fmt(summary.gfPerGame, 2)}</strong>
            <small>gols/jogo</small>
          </div>
          <small className="kpi-sub">{summary.gf} gols marcados no total</small>
        </div>

        {/* Gols Sofridos */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span>MÉDIA DE GOLS SOFRIDOS</span>
            <Shield size={16} />
          </div>
          <div className="kpi-value-row">
            <strong>{fmt(summary.gaPerGame, 2)}</strong>
            <small>gols/jogo</small>
          </div>
          <small className="kpi-sub">{summary.ga} gols sofridos no total</small>
        </div>

        {/* Clean Sheets */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span>JOGOS SEM SOFRER GOLS</span>
            <CheckCircle2 size={16} />
          </div>
          <div className="kpi-value-row">
            <strong>{summary.cleanSheets}</strong>
            <small>({fmt(summary.cleanSheetRate, 1)}%)</small>
          </div>
          <small className="kpi-sub">Segurança defensiva em {summary.cleanSheets} partidas</small>
        </div>
      </div>

      {/* GRÁFICO DE EVOLUÇÃO DE GOLS (ÚLTIMAS 15 PARTIDAS) */}
      <div className="analytics-panel">
        <div className="panel-header-custom">
          <div>
            <h3>Evolução de Gols & Desempenho Recente</h3>
            <p>Histórico das últimas 15 partidas (gols marcados em destaque vs gols sofridos).</p>
          </div>
          <div className="chart-legend-custom">
            <span className="legend-gf">● Gols Pró</span>
            <span className="legend-ga">● Gols Sofridos</span>
          </div>
        </div>

        <div className="modern-bar-chart">
          {validMatches.slice(0, 15).reverse().map((m) => {
            const maxVal = Math.max(1, ...validMatches.slice(0, 15).map((x) => Math.max(x.goalsFor, x.goalsAgainst)));
            const heightFor = Math.max(8, (m.goalsFor / maxVal) * 140);
            const heightAgainst = Math.max(8, (m.goalsAgainst / maxVal) * 140);
            const res = result(m);

            return (
              <div key={m.id} className="chart-column">
                <div className="bar-pair-modern">
                  <div
                    className="bar-gf"
                    style={{ height: `${heightFor}px` }}
                    title={`${m.goalsFor} marcados`}
                  >
                    <span>{m.goalsFor}</span>
                  </div>
                  <div
                    className="bar-ga"
                    style={{ height: `${heightAgainst}px` }}
                    title={`${m.goalsAgainst} sofridos`}
                  >
                    <span>{m.goalsAgainst}</span>
                  </div>
                </div>
                <span className={`result-mini-tag ${res}`}>{res}</span>
                <small>{m.opponent.slice(0, 6)}</small>
              </div>
            );
          })}
        </div>
      </div>

      {/* GRADE EM DUAS COLUNAS: OFENSIVO & CONSTRUÇÃO */}
      <div className="analytics-two-columns">
        {/* Raio-X Ofensivo */}
        <div className="analytics-panel">
          <div className="panel-header-custom">
            <div>
              <h3>Raio-X Ofensivo & Finalizações</h3>
              <p>Eficiência da equipe na frente do gol adversário.</p>
            </div>
            <Target size={20} className="header-icon" />
          </div>

          <div className="panel-stat-highlight-row">
            <div className="mini-stat">
              <small>CONVERSÃO DE CHUTES</small>
              <b>{offensive.conversionRate !== null ? `${fmt(offensive.conversionRate, 1)}%` : '—'}</b>
            </div>
            <div className="mini-stat">
              <small>FINALIZAÇÕES TOTAIS</small>
              <b>{offensive.totalShots}</b>
            </div>
            <div className="mini-stat">
              <small>GOLS MARCADOS</small>
              <b>{offensive.totalGoals}</b>
            </div>
          </div>

          <h4 className="sub-section-title">Maiores Artilheiros</h4>
          <div className="leader-ranked-list">
            {offensive.topScorers.map((p, idx) => (
              <div key={p.id} className="ranked-row">
                <span className="rank-num">#{idx + 1}</span>
                <b className="player-name-text">{p.name}</b>
                <span className="player-pos-sub">{p.position}</span>
                <strong className="ranked-val">⚽ {p.goals} gols</strong>
              </div>
            ))}
          </div>

          <h4 className="sub-section-title">Líderes em Assistências (Garçons)</h4>
          <div className="leader-ranked-list">
            {offensive.topAssisters.map((p, idx) => (
              <div key={p.id} className="ranked-row">
                <span className="rank-num">#{idx + 1}</span>
                <b className="player-name-text">{p.name}</b>
                <span className="player-pos-sub">{p.position}</span>
                <strong className="ranked-val">👟 {p.assists} assist.</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Construção de Jogo & Duplas */}
        <div className="analytics-panel">
          <div className="panel-header-custom">
            <div>
              <h3>Construção & Duplas Entrosadas</h3>
              <p>Precisão de passe e combinações mais letais do elenco.</p>
            </div>
            <Users size={20} className="header-icon" />
          </div>

          <div className="panel-stat-highlight-row">
            <div className="mini-stat">
              <small>PRECISÃO DE PASSE</small>
              <b>{passing.passAccuracy !== null ? `${fmt(passing.passAccuracy, 1)}%` : '—'}</b>
            </div>
            <div className="mini-stat">
              <small>PASSES CERTOS</small>
              <b>{passing.passesMade}</b>
            </div>
            <div className="mini-stat">
              <small>TENTATIVAS</small>
              <b>{passing.passAtt}</b>
            </div>
          </div>

          <h4 className="sub-section-title">Duplas Mais Vitoriosas Juntas</h4>
          <div className="duos-grid-modern">
            {passing.topDuos.map((d, i) => {
              const winPct = (d.wins / d.games) * 100;
              return (
                <div key={i} className="duo-card-modern">
                  <div className="duo-names">
                    <b>{d.p1}</b>
                    <span>+</span>
                    <b>{d.p2}</b>
                  </div>
                  <div className="duo-stats">
                    <span className="duo-games">{d.games} partidas juntos</span>
                    <strong className="duo-winrate">{fmt(winPct)}% vitórias</strong>
                  </div>
                </div>
              );
            })}
            {!passing.topDuos.length && (
              <p className="muted-empty">Aguardando mais partidas para calcular conexões.</p>
            )}
          </div>
        </div>
      </div>

      {/* RAIO-X DEFENSIVO */}
      <div className="analytics-panel">
        <div className="panel-header-custom">
          <div>
            <h3>Solidez Defensiva & Desarmes</h3>
            <p>Capacidade de desarme, intercepção e proteção do gol.</p>
          </div>
          <Shield size={20} className="header-icon" />
        </div>

        <div className="panel-stat-highlight-row">
          <div className="mini-stat">
            <small>EFICIÊNCIA DE DESARME</small>
            <b>{defensive.tackleEfficiency !== null ? `${fmt(defensive.tackleEfficiency, 1)}%` : '—'}</b>
          </div>
          <div className="mini-stat">
            <small>DESARMES CERTOS</small>
            <b>{defensive.tacklesMade}</b>
          </div>
          <div className="mini-stat">
            <small>DEFESAS DE GOLEIRO</small>
            <b>{defensive.totalSaves}</b>
          </div>
        </div>

        <h4 className="sub-section-title">Ladrões de Bola do Time</h4>
        <div className="leader-ranked-list horizontal-list">
          {defensive.topTacklers.map((p, idx) => (
            <div key={p.id} className="ranked-row">
              <span className="rank-num">#{idx + 1}</span>
              <b className="player-name-text">{p.name}</b>
              <strong className="ranked-val">🛡️ {p.tackles} desarmes</strong>
            </div>
          ))}
        </div>
      </div>

      {/* HISTÓRICO FRENTE A FRENTE (HEAD-TO-HEAD) */}
      <div className="analytics-panel">
        <div className="panel-header-custom">
          <div>
            <h3>Confrontos Diretos (Head-to-Head)</h3>
            <p>Retrospecto de vitórias, empates, derrotas e saldo contra cada rival.</p>
          </div>
          <input
            className="search-mini"
            placeholder="Filtrar rival..."
            value={h2hFilter}
            onChange={(e) => setH2hFilter(e.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table className="h2h-table">
            <thead>
              <tr>
                <th>Adversário</th>
                <th>Jogos</th>
                <th>Retrospecto (V / E / D)</th>
                <th>Aproveitamento</th>
                <th>Gols Pró : Contra</th>
                <th>Saldo</th>
                <th>Último Jogo</th>
              </tr>
            </thead>
            <tbody>
              {h2h.map((opp) => {
                const winRate = ((opp.wins * 3 + opp.draws) / (opp.games * 3)) * 100;
                const diff = opp.gf - opp.ga;

                return (
                  <tr key={opp.name}>
                    <td>
                      <b className="rival-name">{opp.name}</b>
                    </td>
                    <td>{opp.games}</td>
                    <td>
                      <span className="h2h-pill">
                        <b className="c-v">{opp.wins}V</b> •{' '}
                        <b className="c-e">{opp.draws}E</b> •{' '}
                        <b className="c-d">{opp.losses}D</b>
                      </span>
                    </td>
                    <td>
                      <b className="h2h-rate">{fmt(winRate)}%</b>
                    </td>
                    <td>
                      <span className="h2h-goals">
                        {opp.gf} : {opp.ga}
                      </span>
                    </td>
                    <td>
                      <span className={`diff-pill ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </td>
                    <td>
                      <small className="text-muted">{dateFormatted(opp.lastPlayed)}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
