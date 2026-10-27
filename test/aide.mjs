// Faux npm pour les tests : rejoue les sorties enregistrées sur une vraie application Angular 19
// (test/fixtures/appli-v19/npm, relevées le 2026-10-23). Aucun accès réseau pendant les tests.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { remplacerLanceur } from '../src/executer.mjs';
import { viderCache } from '../src/registre.mjs';

export const ICI = path.dirname(fileURLToPath(import.meta.url));
export const APPLI = path.join(ICI, 'fixtures', 'appli-v19');
const NPM = path.join(APPLI, 'npm');

export const lire = (f) => readFileSync(path.join(NPM, f), 'utf8');
export const DATE = new Date('2026-10-23T12:00:00Z');

export function installerFauxNpm({ journal = [], surcharges = {} } = {}) {
  viderCache();
  remplacerLanceur((cmd, args, opts) => {
    journal.push([cmd, ...args].join(' '));
    const cle = [cmd, ...args].join(' ');
    if (surcharges[cle]) return surcharges[cle];
    if (cmd === 'npm' && args[0] === 'outdated') return { code: 1, stdout: lire('outdated.json'), stderr: '' };
    if (cmd === 'npm' && args[0] === 'audit') return { code: 1, stdout: lire('audit.json'), stderr: '' };
    if (cmd === 'npm' && args[0] === 'view') {
      const nom = args[1].replace(/@>=.*$/, '');
      const f = path.join(NPM, 'view' + nom.replace(/[/@]/g, '_') + '.json');
      if (!existsSync(f)) return { code: 1, stdout: '', stderr: `npm error 404 '${nom}' is not in this registry.` };
      return { code: 0, stdout: readFileSync(f, 'utf8'), stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  });
  return journal;
}

export function retirerFauxNpm() {
  remplacerLanceur(null);
  viderCache();
}
