// Mises à jour sûres sur un vrai dépôt git temporaire. git et la vérification tournent pour de vrai ;
// seul npm est simulé (pas de réseau) : `npm install a@x` réécrit package.json comme le ferait npm.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { remplacerLanceur } from '../src/executer.mjs';
import { appliquerSures } from '../src/appliquer.mjs';

after(() => remplacerLanceur(null));

const vrai = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

async function depot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ngm-sures-'));
  const pkg = { name: 'demo', version: '1.0.0', scripts: { test: 'node verif.mjs', build: 'node -e "process.exit(0)"' }, dependencies: { '@angular/core': '^19.2.0', a: '^1.0.0', b: '^2.0.0', c: '^3.0.0' } };
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  // La « suite de tests » du client échoue si b passe en 2.1.0 (régression simulée).
  await writeFile(path.join(dir, 'verif.mjs'), `import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync('package.json', 'utf8'));
if (p.dependencies.b === '^2.1.0') { console.error('test « tableau des alarmes » en échec'); process.exit(1); }`);
  for (const a of [['init', '-q'], ['config', 'user.email', 'dev@exemple.fr'], ['config', 'user.name', 'Dev'], ['add', '-A'], ['commit', '-qm', 'init']]) vrai('git', a, dir);
  return dir;
}

function lanceur(dir, journal) {
  return (cmd, args, { cwd }) => {
    journal.push([cmd, ...args].join(' '));
    if (cmd === 'git') return vrai('git', args, cwd);
    if (cmd === 'sh') return vrai('sh', args, cwd);
    if (cmd === 'npm' && args[0] === 'install') {
      const f = path.join(cwd, 'package.json');
      const p = JSON.parse(spawnSync('cat', [f], { encoding: 'utf8' }).stdout);
      for (const s of args.filter((x) => !x.startsWith('-')).slice(1)) {
        const i = s.lastIndexOf('@');
        p.dependencies[s.slice(0, i)] = '^' + s.slice(i + 1);
      }
      spawnSync('sh', ['-c', `cat > package.json`], { cwd, input: JSON.stringify(p, null, 2) });
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'npm' && args[0] === 'audit' && args[1] === 'fix') return { code: 0, stdout: '', stderr: '' };
    if (cmd === 'npm' && args[0] === 'audit') return { code: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }), stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
}

const etat = {
  vulnerabilites: { total: 0 },
  dependances: [
    { name: 'a', version: '1.0.0', voulue: '1.2.0', sure: 'minor' },
    { name: 'b', version: '2.0.0', voulue: '2.1.0', sure: 'minor' },
    { name: 'c', version: '3.0.0', voulue: '3.0.4', sure: 'patch' },
  ],
};

test('échec groupé → essai paquet par paquet : b écartée, a et c commitées', async () => {
  const dir = await depot();
  const journal = [];
  remplacerLanceur(lanceur(dir, journal));
  const r = await appliquerSures(dir, { date: new Date('2026-10-23T12:00:00Z'), etat });
  assert.deepEqual(r.appliquees.map((x) => x.name), ['a', 'c']);
  assert.deepEqual(r.rejetees.map((x) => x.name), ['b']);
  assert.equal(r.rejetees[0].raison.etape, 'test');
  assert.match(r.rejetees[0].raison.extrait, /tableau des alarmes/);
  assert.ok(r.commit);
  assert.equal(r.branche, 'maintenance/2026-10');
  // La branche de départ est intacte, la branche de maintenance porte les mises à jour.
  assert.equal(vrai('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir).stdout.trim(), r.depart);
  assert.match(await readFile(path.join(dir, 'package.json'), 'utf8'), /"a": "\^1\.0\.0"/);
  const surBranche = JSON.parse(vrai('git', ['show', `${r.branche}:package.json`], dir).stdout);
  assert.deepEqual([surBranche.dependencies.a, surBranche.dependencies.b, surBranche.dependencies.c], ['^1.2.0', '^2.0.0', '^3.0.4']);
  const message = vrai('git', ['log', '-1', '--format=%an%n%B', r.branche], dir).stdout;
  assert.match(message, /^Dev\n/, 'auteur = personne configurée dans le dépôt');
  assert.match(message, /a 1\.0\.0 → 1\.2\.0/);
  assert.ok(!journal.some((l) => l.startsWith('git push')), 'rien poussé sans --pousser');
});

test('dépôt avec modifications en cours : refus', async () => {
  const dir = await depot();
  remplacerLanceur(lanceur(dir, []));
  await writeFile(path.join(dir, 'brouillon.txt'), 'x');
  await assert.rejects(appliquerSures(dir, { etat }), /modifications non commitées/);
});

test('branche du mois déjà présente : refus', async () => {
  const dir = await depot();
  remplacerLanceur(lanceur(dir, []));
  vrai('git', ['branch', 'maintenance/2026-10'], dir);
  await assert.rejects(appliquerSures(dir, { etat, date: new Date('2026-10-23T12:00:00Z') }), /existe déjà/);
});
