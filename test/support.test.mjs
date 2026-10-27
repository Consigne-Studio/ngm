import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statut, cible, soutenues, VERSIONS, PREREQUIS } from '../src/support.mjs';

const d = (s) => new Date(s + 'T12:00:00Z');

test('état de support le 2026-10-23 (relevé angular.dev)', () => {
  const j = d('2026-10-23');
  assert.equal(statut(19, j).etat, 'fin');
  assert.equal(statut(20, j).etat, 'lts');
  assert.equal(statut(20, j).joursRestants, 36);
  assert.equal(statut(21, j).etat, 'lts');
  assert.equal(statut(22, j).etat, 'active');
  assert.equal(statut(11, j).etat, 'fin');
  assert.deepEqual(soutenues(j), [20, 21, 22]);
});

test('cible : LTS avec 6 mois de marge, ou dernière active', () => {
  assert.equal(cible('lts', d('2026-10-23')), 21);
  assert.equal(cible('derniere', d('2026-10-23')), 22);
  assert.equal(cible('lts', d('2027-01-10')), 22); // v21 n'a plus 180 jours
});

test('table cohérente', () => {
  for (const v of VERSIONS) {
    assert.ok(v.sortie < v.finActive && v.finActive <= v.fin, `dates de v${v.major}`);
  }
  for (let m = 14; m <= 22; m++) assert.ok(PREREQUIS[m], `prérequis v${m}`);
});
