// Suivi du temps par client : un fichier interventions.csv, une ligne par intervention.
// Colonnes : date;minutes;type;description;ref
// Types :
//   routine   diagnostic, mises à jour sûres, rapport : compris dans l'abonnement, non décompté
//   majeure   montée de version majeure : non décomptée si le palier l'inclut, sinon facturée comme « hors »
//   correctif correction d'anomalie : décompté du crédit d'heures
//   evolution petite évolution : décomptée du crédit d'heures
//   hors      hors forfait, sur devis accepté : facturé au taux horaire
import { readFile, appendFile, access } from 'node:fs/promises';
import { palier, CONDITIONS } from './offre.mjs';

export const TYPES = ['routine', 'majeure', 'correctif', 'evolution', 'hors'];
export const ENTETE = 'date;minutes;type;description;ref';

export function lireCSV(texte) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (!lignes.length) return [];
  const [entete, ...corps] = lignes;
  if (entete.trim() !== ENTETE) throw new Error(`en-tête attendu : ${ENTETE}`);
  return corps.map((l, i) => {
    const [date, minutes, type, description = '', ref = ''] = l.split(';');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`ligne ${i + 2} : date invalide « ${date} »`);
    const m = Number(minutes);
    if (!Number.isInteger(m) || m <= 0) throw new Error(`ligne ${i + 2} : minutes invalides « ${minutes} »`);
    if (!TYPES.includes(type)) throw new Error(`ligne ${i + 2} : type « ${type} » inconnu (${TYPES.join(', ')})`);
    return { date, minutes: m, type, description: description.trim(), ref: ref.trim() };
  });
}

export async function lireFichier(chemin) {
  try { await access(chemin); } catch { return []; }
  return lireCSV(await readFile(chemin, 'utf8'));
}

export async function ajouter(chemin, { date, minutes, type, description, ref = '' }) {
  if (description.includes(';') || ref.includes(';')) throw new Error('le point-virgule est réservé au séparateur');
  lireCSV(`${ENTETE}\n${date};${minutes};${type};${description};${ref}`); // validation
  let entete = '';
  try { await access(chemin); } catch { entete = ENTETE + '\n'; }
  await appendFile(chemin, `${entete}${date};${minutes};${type};${description};${ref}\n`);
}

const moisPrecedent = (m) => {
  const [a, mo] = m.split('-').map(Number);
  return mo === 1 ? `${a - 1}-12` : `${a}-${String(mo - 1).padStart(2, '0')}`;
};

/**
 * Bilan d'un mois (« AAAA-MM ») pour un palier.
 * Crédit = heures du palier + reliquat du mois précédent (report d'un mois au plus, CONDITIONS.reportHeuresMois).
 */
export function bilan(interventions, mois, clePalier) {
  const p = palier(clePalier);
  const du = (m) => interventions.filter((x) => x.date.startsWith(m));
  const decompte = (liste) => liste.filter((x) => x.type === 'correctif' || x.type === 'evolution').reduce((s, x) => s + x.minutes, 0);

  const precedent = du(moisPrecedent(mois));
  const reliquat = CONDITIONS.reportHeuresMois > 0 ? Math.max(0, p.heures * 60 - decompte(precedent)) : 0;
  const ceMois = du(mois);
  const consomme = decompte(ceMois);
  const credit = p.heures * 60 + reliquat;
  const depassement = Math.max(0, consomme - credit);
  const hors = ceMois.filter((x) => x.type === 'hors' || (x.type === 'majeure' && !p.majeureIncluse)).reduce((s, x) => s + x.minutes, 0);
  const parType = Object.fromEntries(TYPES.map((t) => [t, ceMois.filter((x) => x.type === t).reduce((s, x) => s + x.minutes, 0)]));
  // Facturable en plus : le dépassement du crédit (à valider par le client) et le hors-forfait accepté.
  const facturableMinutes = depassement + hors;
  return {
    mois,
    palier: p.cle,
    creditMinutes: credit,
    reliquatMinutes: reliquat,
    consommeMinutes: consomme,
    resteMinutes: Math.max(0, credit - consomme),
    depassementMinutes: depassement,
    totalMinutes: ceMois.reduce((s, x) => s + x.minutes, 0),
    parType,
    facturableMinutes,
    facturableHT: Math.round((facturableMinutes / 60) * CONDITIONS.heureSupHT * 100) / 100,
    interventions: ceMois,
  };
}

export const hm = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
