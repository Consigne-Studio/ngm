// Essai de bout en bout sur une vraie application, avec le réseau : rejoue la preuve de la version 1.0.0.
//   1. ng new en Angular 19, plus Material, PrimeNG, NgRx et un lodash vulnérable
//   2. ngm mois     (diagnostic, mises à jour sans risque vérifiées, rapport HTML/MD/PDF)
//   3. ngm majeure --vers 20, puis --vers 21 (lint absent, tests Karma headless, build)
// Environ 10 minutes et 1,5 Go dans un dossier temporaire. Exige Node 22, npm 11 (bogue de npm 10 vers Angular 21),
// git et Chrome ou Chromium (CHROME_BIN). Usage : npm run e2e  [--garder] pour conserver le dossier.
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NGM = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'ngm.mjs');
const garder = process.argv.includes('--garder');
const racine = await mkdtemp(path.join(tmpdir(), 'ngm-e2e-'));
const depot = path.join(racine, 'depot');
const debut = Date.now();
let etape = 0;

function lancer(titre, cmd, args, cwd = racine) {
  etape++;
  const t = Date.now();
  process.stdout.write(`${etape}. ${titre} … `);
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, CI: '1', NG_CLI_ANALYTICS: 'false' }, maxBuffer: 64 << 20 });
  const duree = `${Math.round((Date.now() - t) / 1000)} s`;
  if (r.status !== 0) {
    console.log(`ÉCHEC (${duree})`);
    console.log((r.stdout ?? '').slice(-4000), (r.stderr ?? '').slice(-4000));
    console.log(`Dossier conservé : ${racine}`);
    process.exit(1);
  }
  console.log(`ok (${duree})`);
  return r.stdout;
}
const verifier = async (f) => { await access(f); return f; };

const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout.trim();
if (Number(npm.split('.')[0]) < 11) { console.error(`npm ${npm} : npm 11 requis pour l'étape Angular 21 (npm install -g npm@11)`); process.exit(1); }

lancer('ng new (Angular 19)', 'npx', ['--yes', '@angular/cli@19', 'new', 'depot', '--defaults', '--skip-git', '--style=css', '--ssr=false', '--skip-install']);
const pkg = JSON.parse(await readFile(path.join(depot, 'package.json'), 'utf8'));
pkg.scripts['test:ci'] = 'ng test --watch=false --browsers=ChromeHeadlessCI';
await writeFile(path.join(depot, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
lancer('npm install', 'npm', ['install', '--no-audit', '--no-fund'], depot);
// Angular 19 ne crée plus karma.conf.js : on le génère pour y déclarer un Chrome sans bac à sable (conteneurs, CI).
const karma = path.join(depot, 'karma.conf.js');
if (!(await access(karma).then(() => true, () => false))) lancer('karma.conf.js', 'npx', ['ng', 'generate', 'config', 'karma'], depot);
await writeFile(karma, (await readFile(karma, 'utf8')).replace("browsers: ['Chrome'],", "browsers: ['Chrome'],\n    customLaunchers: { ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox'] } },"));
// En dependencies (npm applique -D à tous les paquets d'une même commande : ng update échoue alors sur les pairs).
lancer('bibliothèques tierces', 'npm', ['install', '--no-audit', '--no-fund', '@angular/material@19', '@angular/cdk@19', 'primeng@19', '@ngrx/store@19', 'lodash@4.17.15'], depot);
lancer('types lodash', 'npm', ['install', '--no-audit', '--no-fund', '-D', '@types/lodash'], depot);
await writeFile(path.join(depot, 'package.json'), (await readFile(path.join(depot, 'package.json'), 'utf8')).replace('"lodash": "4.17.15"', '"lodash": "^4.17.15"'));
lancer('npm install (plage lodash)', 'npm', ['install', '--no-audit', '--no-fund'], depot);
lancer('git init', 'sh', ['-c', 'git init -q -b main && git add -A && git -c user.name=essai -c user.email=essai@exemple.invalid commit -qm "appli v19"'], depot);
spawnSync('git', ['config', 'user.name', 'essai'], { cwd: depot });
spawnSync('git', ['config', 'user.email', 'essai@exemple.invalid'], { cwd: depot });

const fiche = path.join(racine, 'essai.client.json');
await writeFile(fiche, JSON.stringify({ client: 'Essai (fictif)', application: 'Appli de démonstration', palier: 'suivi', depot: 'depot', interventions: 'interventions.csv', suivi: 'suivi' }, null, 2));

const diag = lancer('ngm diagnostic', 'node', [NGM, 'diagnostic', depot]);
if (!/Angular 19/.test(diag) || !/P1/.test(diag)) throw new Error('diagnostic inattendu :\n' + diag);

lancer('ngm mois', 'node', [NGM, 'mois', '--fiche', fiche]);
const mois = new Date().toISOString().slice(0, 7);
const sortie = path.join(racine, 'suivi', mois);
for (const f of [`rapport-${mois}.html`, `rapport-${mois}.md`, 'etat.json', 'sures.json', 'plan.json']) await verifier(path.join(sortie, f));
const sures = JSON.parse(await readFile(path.join(sortie, 'sures.json'), 'utf8'));
console.log(`   mises à jour appliquées : ${sures.appliquees.length} · PDF : ${await access(path.join(sortie, `rapport-${mois}.pdf`)).then(() => 'oui', () => 'non (Chrome absent)')}`);
lancer('retour sur main', 'git', ['checkout', '-q', 'main'], depot);

lancer('ngm majeure --vers 20', 'node', [NGM, 'majeure', depot, '--vers', '20', '--json', path.join(racine, 'majeure-20.json')]);
lancer('ngm majeure --vers 21 (depuis la branche 20)', 'sh', ['-c', `git checkout -q maintenance/angular-20 && node ${JSON.stringify(NGM)} majeure . --vers 21 --json ../majeure-21.json`], depot);
const lock = JSON.parse(spawnSync('git', ['show', 'maintenance/angular-21:package-lock.json'], { cwd: depot, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
const v = lock.packages['node_modules/@angular/core'].version;
if (!v.startsWith('21.')) throw new Error(`@angular/core attendu en 21 sur maintenance/angular-21, trouvé ${v}`);

console.log(`\n✓ bout en bout vert en ${Math.round((Date.now() - debut) / 60000)} min · Angular ${v}`);
if (garder) console.log(`Dossier : ${racine}`); else await rm(racine, { recursive: true, force: true });
