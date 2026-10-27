import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfies, compare, ecart, maxSatisfying } from '../src/semver.mjs';

test('plages npm courantes', () => {
  const cas = [
    ['19.2.25', '^19.0.0', true], ['20.0.0', '^19.0.0', false], ['19.2.25', '~19.2.0', true], ['19.3.0', '~19.2.0', false],
    ['20.0.3', '^20.0.4', false], ['20.1.0', '^20.0.4', true], ['5.8.3', '>=5.8.0 <6.0.0', true], ['6.0.0', '>=5.8.0 <6.0.0', false],
    ['22.12.0', '^20.19.0 || ^22.12.0 || ^24.0.0', true], ['22.11.0', '^20.19.0 || ^22.12.0 || ^24.0.0', false],
    ['19.0.0', '19.x', true], ['18.9.9', '>=19', false], ['0.2.5', '^0.2.3', true], ['0.3.0', '^0.2.3', false],
    ['20.0.0-rc.1', '^20.0.0', false], ['1.2.3', '*', true], ['4.17.21', '1.0.0 - 5.0.0', true],
  ];
  for (const [v, r, ok] of cas) assert.equal(satisfies(v, r), ok, `${v} dans ${r}`);
});

test('comparaison et écart', () => {
  assert.equal(compare('19.2.25', '19.10.0'), -1);
  assert.equal(compare('20.0.0-rc.1', '20.0.0'), -1);
  assert.equal(ecart('19.2.1', '22.0.1'), 'major');
  assert.equal(ecart('4.17.15', '4.18.1'), 'minor');
  assert.equal(ecart('1.0.0', '1.0.1'), 'patch');
  assert.equal(ecart('2.0.0', '1.0.0'), null);
  assert.equal(maxSatisfying(['20.0.0', '20.4.0', '21.0.0', '20.5.0-rc.0'], '^20.0.0'), '20.4.0');
});
