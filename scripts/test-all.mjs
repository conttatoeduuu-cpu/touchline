import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', chunk => {
  output += chunk;
});
server.stderr.on('data', chunk => {
  output += chunk;
});

async function waitUntilReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Servidor encerrou antes dos testes.\n${output.slice(-4000)}`);
    }
    if (output.includes('Local:') && output.includes('http://localhost:3000')) return;
    try {
      const response = await fetch('http://localhost:3000/', {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status < 500) return;
    } catch {
      // O servidor ainda está compilando.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor não ficou pronto em 60 segundos.\n${output.slice(-4000)}`);
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${script} falhou com código ${code}`)),
    );
  });
}

try {
  await waitUntilReady();
  await run('scripts/test-domain.mjs');
  await run('scripts/test-persistence.mjs');
  await run('scripts/test-security.mjs');
  console.log('Todas as verificações automatizadas passaram.');
} finally {
  server.kill('SIGTERM');
}
