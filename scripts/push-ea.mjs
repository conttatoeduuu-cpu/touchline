// Coleta EA do PC do LO e envia pro Touchline via push
const ORIGIN = 'https://touchline.touchline-clubs.workers.dev';
const KEY = '2f53320178a3c41d9fefb1e0731c7aa0632650eea8358dec524740fe558596eb';

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Origin': 'https://www.ea.com',
  'Referer': 'https://www.ea.com/',
};

const TEAMS = {
  dtr:    { clubId: '9212', platform: 'common-gen5' },
  vortex: { clubId: '4504', platform: 'common-gen5' },
};

const MATCH_TYPES = ['friendlyMatch'];
const SNAPSHOT_PATHS = ['clubs/info', 'members/stats', 'members/career/stats', 'clubs/overallStats', 'clubs/seasonalStats'];

const wait = ms => new Promise(r => setTimeout(r, ms));

async function fetchEA(path, params) {
  const url = new URL(`https://proclubs.ea.com/api/fc/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`EA HTTP ${r.status}`);
  return r.json();
}

async function collectTeam(team, cfg) {
  const data = { matches: {}, snapshots: {} };
  let ok = 0, fail = 0;

  for (const type of MATCH_TYPES) {
    try {
      const raw = await fetchEA('clubs/matches', { platform: cfg.platform, clubIds: cfg.clubId, matchType: type, maxResultCount: '20' });
      if (Array.isArray(raw)) { data.matches[type] = raw; ok++; console.log(`  ✓ ${type}: ${raw.length} partidas`); }
    } catch (e) { console.log(`  ✗ ${type}: ${e.message}`); fail++; }
    await wait(1500);
  }

  for (const path of SNAPSHOT_PATHS) {
    try {
      const raw = await fetchEA(path, { platform: cfg.platform, clubIds: cfg.clubId, clubId: cfg.clubId });
      data.snapshots[path] = raw; ok++;
      console.log(`  ✓ ${path}`);
    } catch (e) { console.log(`  ✗ ${path}: ${e.message}`); fail++; }
    await wait(1500);
  }

  return { data, ok, fail };
}

console.log(`\n=== Coleta EA Local → Touchline ===\n`);

// Teste rápido
try {
  await fetchEA('clubs/info', { platform: 'common-gen5', clubIds: '9212' });
  console.log('EA acessível ✓\n');
} catch (e) {
  console.log(`EA INACESSÍVEL: ${e.message}`);
  process.exit(1);
}

await wait(2000);

const pushData = {};
for (const [team, cfg] of Object.entries(TEAMS)) {
  console.log(`Coletando ${team} (clubId: ${cfg.clubId})...`);
  const { data, ok, fail } = await collectTeam(team, cfg);
  pushData[team] = data;
  const matchCount = Object.values(data.matches).reduce((n, a) => n + a.length, 0);
  console.log(`  ${ok} fontes OK, ${fail} falhas, ${matchCount} partidas\n`);
  await wait(3000);
}

// Envia pro Touchline
console.log('Enviando dados pro Touchline...');
const response = await fetch(`${ORIGIN}/api/jobs`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ push: true, data: pushData }),
  signal: AbortSignal.timeout(60000),
});

const result = await response.json();
console.log(`HTTP ${response.status}`);
console.log(JSON.stringify(result, null, 2));
