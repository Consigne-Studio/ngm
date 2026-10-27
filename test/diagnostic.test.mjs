import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { installerFauxNpm, retirerFauxNpm, APPLI, DATE } from './aide.mjs';
import { diagnostiquer } from '../src/diagnostic.mjs';
import { commandes, lireProjet } from '../src/projet.mjs';

after(retirerFauxNpm);

test('application Angular 19 réelle : diagnostic complet', async () => {
  installerFauxNpm();
  const e = await diagnostiquer(APPLI, { date: DATE });
  assert.equal(e.projet.angular.major, 19);
  assert.equal(e.support.etat, 'fin');
  assert.equal(e.cible, 21);
  assert.equal(e.vulnerabilites.total, 36);
  assert.equal(e.vulnerabilites.critical, 2);
  assert.equal(e.indicateurs.faillesGraves, 21);
  const codes = e.actions.map((a) => a.code);
  assert.deepEqual(codes.slice(0, 2), ['eol', 'failles-critiques']);
  assert.ok(codes.includes('sures'));
  const lodash = e.dependances.find((x) => x.name === 'lodash');
  assert.equal(lodash.sure, 'minor');
  assert.equal(lodash.voulue, '4.18.1');
  assert.ok(e.dependances.find((x) => x.name === 'typescript').framework, 'TypeScript suit Angular');
  assert.ok(e.vulnerabilites.avis.every((a, i, t) => i === 0 || ['critical', 'high', 'moderate', 'low', 'info'].indexOf(t[i - 1].gravite) <= ['critical', 'high', 'moderate', 'low', 'info'].indexOf(a.gravite)), 'avis triés par gravité');
});

test('commandes de vérification : test:ci prioritaire, ng test non interactif sinon', async () => {
  const p = await lireProjet(APPLI);
  assert.equal(commandes(p).test, 'npm run test:ci');
  assert.equal(commandes(p).build, 'npm run build');
  assert.equal(commandes(p).lint, null);
  const sansCi = { ...p, scripts: { test: 'ng test' } };
  assert.equal(commandes(sansCi).test, 'npm run test -- --watch=false --browsers=ChromeHeadless');
  assert.equal(commandes(p, { test: 'npx vitest run' }).test, 'npx vitest run');
});

test('audit.json de l’offre d’audit repris comme référence', async () => {
  installerFauxNpm();
  const { mkdtemp, writeFile, cp } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ngm-'));
  await cp(APPLI, dir, { recursive: true });
  await writeFile(path.join(dir, 'audit.json'), JSON.stringify({ date: '2026-10-01', angular: { version: '19.2.25', major: 19 }, findings: [{ id: 'A1', severity: 'P1', title: 'Version hors support', axe: 'versions', count: 1 }] }));
  const e = await diagnostiquer(dir, { date: DATE });
  assert.equal(e.reference.constats[0].id, 'A1');
  assert.equal(e.reference.date, '2026-10-01');
});
