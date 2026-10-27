import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireCSV, bilan, ajouter, lireFichier } from '../src/heures.mjs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CSV = `date;minutes;type;description;ref
2026-09-10;30;correctif;Libellé;#40
2026-10-02;45;routine;Diagnostic et mises à jour;
2026-10-09;90;correctif;Tri du tableau;#42
2026-10-15;200;evolution;Export CSV;#45
2026-10-20;300;majeure;Angular 21;`;

test('bilan Suivi : reliquat reporté, majeure incluse non décomptée', () => {
  const b = bilan(lireCSV(CSV), '2026-10', 'suivi');
  assert.equal(b.creditMinutes, 240 + 210);
  assert.equal(b.consommeMinutes, 290);
  assert.equal(b.resteMinutes, 160);
  assert.equal(b.depassementMinutes, 0);
  assert.equal(b.totalMinutes, 635);
  assert.equal(b.facturableHT, 0);
});

test('bilan Veille : dépassement et majeure non incluse facturés', () => {
  const b = bilan(lireCSV(CSV), '2026-10', 'veille');
  assert.equal(b.creditMinutes, 60 + 30);
  assert.equal(b.depassementMinutes, 200);
  assert.equal(b.facturableMinutes, 500);
  assert.equal(b.facturableHT, 791.67);
});

test('validation des lignes', () => {
  assert.throws(() => lireCSV('date;minutes;type;description;ref\n2026-10-02;45;reunion;x;'), /type « reunion » inconnu/);
  assert.throws(() => lireCSV('date;minutes;type;description;ref\n02/10/2026;45;routine;x;'), /date invalide/);
  assert.throws(() => lireCSV('date;minutes;type;description;ref\n2026-10-02;0;routine;x;'), /minutes invalides/);
});

test('ajout dans un fichier neuf', async () => {
  const f = path.join(await mkdtemp(path.join(os.tmpdir(), 'ngm-h-')), 'interventions.csv');
  await ajouter(f, { date: '2026-10-23', minutes: 30, type: 'correctif', description: 'Test' });
  await ajouter(f, { date: '2026-10-24', minutes: 15, type: 'routine', description: 'Rapport' });
  assert.equal((await lireFichier(f)).length, 2);
  await assert.rejects(ajouter(f, { date: '2026-10-24', minutes: 15, type: 'routine', description: 'a;b' }), /point-virgule/);
});
