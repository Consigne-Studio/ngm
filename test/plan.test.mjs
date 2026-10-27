import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { installerFauxNpm, retirerFauxNpm, APPLI, DATE } from './aide.mjs';
import { diagnostiquer } from '../src/diagnostic.mjs';
import { planifier, accepteMajeure } from '../src/plan.mjs';

after(retirerFauxNpm);

test('plan 19 → 21 : une majeure à la fois, bibliothèques tierces suivies', async () => {
  installerFauxNpm();
  const e = await diagnostiquer(APPLI, { date: DATE });
  const p = await planifier(e, { node: '22.22.0' });
  assert.deepEqual(p.etapes.map((x) => x.vers), [20, 21]);
  assert.deepEqual(p.bloquants, []);
  const e20 = p.etapes[0];
  assert.match(e20.commandes[0], /^npx ng update @angular\/core@20 @angular\/cli@20 @angular\/material@20 @ngrx\/store@20\.\d+\.\d+ primeng@20\.\d+\.\d+$/);
  assert.equal(e20.commandes.length, 2, 'une commande ng update + rappel de vérification');
  const libs = Object.fromEntries(e20.bibliotheques.map((b) => [b.name, b.conseillee]));
  assert.match(libs['primeng'], /^20\./);
  assert.match(libs['@ngrx/store'], /^20\./);
  assert.match(p.etapes[1].bibliotheques.find((b) => b.name === 'primeng').conseillee, /^21\./);
  assert.ok(!e20.bibliotheques.some((b) => b.name === 'lodash'), 'lodash ne dépend pas d’Angular');
  assert.equal(p.heures, 12);
  assert.equal(p.guide, 'https://angular.dev/update-guide?v=19.0-21.0&l=2');
});

test('Node trop ancien signalé avant ng update', async () => {
  installerFauxNpm();
  const e = await diagnostiquer(APPLI, { date: DATE });
  const p = await planifier(e, { node: '18.20.0', vers: 20 });
  assert.match(p.etapes[0].alertes[0], /Node 18\.20\.0 ne convient pas à Angular 20/);
});

test('npm 10 signalé avant une montée vers Angular 21', async () => {
  installerFauxNpm();
  const e = await diagnostiquer(APPLI, { date: DATE });
  const p = await planifier(e, { node: '22.22.0', npm: '10.9.4' });
  assert.equal(p.etapes[0].alertes.length, 0);
  assert.match(p.etapes[1].alertes[0], /npm 10\.9\.4 échoue à installer Angular 21/);
  const ok = await planifier(e, { node: '22.22.0', npm: '11.21.1' });
  assert.equal(ok.etapes[1].alertes.length, 0);
});

test('bibliothèques Angular en devDependencies signalées (ng update échoue sur les pairs)', async () => {
  installerFauxNpm();
  const e = await diagnostiquer(APPLI, { date: DATE });
  const dev = { ...e, dependances: e.dependances.map((d) => (['@angular/material', 'primeng', 'lodash'].includes(d.name) ? { ...d, dev: true } : d)) };
  const p = await planifier(dev, { node: '22.22.0', npm: '11.21.1' });
  assert.match(p.etapes[0].alertes[0], /^@angular\/material, primeng sont en devDependencies/);
  assert.equal(p.etapes[1].alertes.length, 0);
});

test('déjà à la cible : rien à monter', async () => {
  installerFauxNpm();
  const e = await diagnostiquer(APPLI, { date: DATE });
  const p = await planifier({ ...e, projet: { ...e.projet, angular: { version: '21.2.0', major: 21 } } }, { vers: 21 });
  assert.equal(p.etapes.length, 0);
  assert.match(p.message, /déjà au niveau/);
});

test('plages de pairs', () => {
  assert.ok(accepteMajeure('^20.0.4', 20));
  assert.ok(accepteMajeure('^19.0.0 || ^20.0.0', 20));
  assert.ok(!accepteMajeure('^19.0.0', 20));
  assert.ok(accepteMajeure('>=15.0.0', 22));
});
