// Interrogation du registre npm via la commande npm elle-même : elle respecte le proxy,
// le registre privé et l'authentification déjà configurés chez le client (.npmrc).
import { executer, jsonDe } from './executer.mjs';

const cache = new Map();

/**
 * Versions publiées à partir de la majeure `depuis` (hors préversions), avec leurs peerDependencies.
 * On borne la requête : sur une plage très large, `npm view` ne renvoie plus que la liste des numéros.
 */
export async function versionsAvecPairs(nom, { cwd, depuis = 0 } = {}) {
  const cle = `${nom}@${depuis}`;
  if (cache.has(cle)) return cache.get(cle);
  const res = await executer('npm', ['view', `${nom}@>=${depuis}`, 'version', 'peerDependencies', '--json'], { cwd });
  if (res.code !== 0 && !res.stdout.trim()) throw new Error(`npm view ${nom} : ${res.stderr.trim().split('\n').pop()}`);
  let data = jsonDe(res, []);
  // Une seule version : npm renvoie un objet au lieu d'un tableau.
  if (!Array.isArray(data)) data = [data];
  // Si aucune version de la plage n'a de peerDependencies, npm renvoie de simples numéros.
  const liste = data
    .map((x) => (typeof x === 'string' ? { version: x, pairs: {} } : { version: x.version, pairs: x.peerDependencies ?? {} }))
    .filter((x) => x.version && !x.version.includes('-'));
  cache.set(cle, liste);
  return liste;
}

export async function etiquettes(nom, { cwd } = {}) {
  const res = await executer('npm', ['view', nom, 'dist-tags', '--json'], { cwd });
  return jsonDe(res, {});
}

/** `npm outdated --json` : { nom: { current, wanted, latest, dependent, location } } */
export async function perimees(dossier) {
  const res = await executer('npm', ['outdated', '--json', '--long'], { cwd: dossier });
  const data = jsonDe(res, {});
  if (data.error) throw new Error(`npm outdated : ${data.error.summary ?? data.error.code}`);
  return data;
}

/** `npm audit --json` (format npm 7+). */
export async function audit(dossier) {
  const res = await executer('npm', ['audit', '--json'], { cwd: dossier });
  const data = jsonDe(res, {});
  if (data.error) throw new Error(`npm audit : ${data.error.summary ?? data.error.code}`);
  return data;
}

export function viderCache() {
  cache.clear();
}
