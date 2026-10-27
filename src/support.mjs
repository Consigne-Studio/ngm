// Fenêtres de support officielles d'Angular et prérequis de chaque majeure.
// Sources : https://angular.dev/reference/releases et https://angular.dev/reference/versions (relevé du 2026-10-23).
// À mettre à jour à chaque sortie de majeure (mai et novembre) : c'est la seule donnée « vivante » de l'outil.

export const RELEVE = '2026-10-23';

// fin : fin du support LTS (plus aucun correctif de sécurité après cette date).
// precision 'mois' : angular.dev n'annonce que le mois ; on retient le 1er, par prudence.
// estime : version pas encore sortie. angular.dev annonce v23.0 « ~ June 2027 » et 24 mois de support (12 actifs + 12 LTS) depuis la v22.
export const VERSIONS = [
  { major: 12, sortie: '2021-05-12', finActive: '2021-11-12', fin: '2022-11-12' },
  { major: 13, sortie: '2021-11-04', finActive: '2022-05-04', fin: '2023-05-04' },
  { major: 14, sortie: '2022-06-02', finActive: '2022-11-18', fin: '2023-11-18' },
  { major: 15, sortie: '2022-11-18', finActive: '2023-05-03', fin: '2024-05-18' },
  { major: 16, sortie: '2023-05-03', finActive: '2023-11-08', fin: '2024-11-08' },
  { major: 17, sortie: '2023-11-08', finActive: '2024-05-15', fin: '2025-05-15' },
  { major: 18, sortie: '2024-05-22', finActive: '2024-11-19', fin: '2025-11-21' },
  { major: 19, sortie: '2024-11-19', finActive: '2025-05-28', fin: '2026-05-19' },
  { major: 20, sortie: '2025-05-28', finActive: '2025-11-19', fin: '2026-11-28' },
  { major: 21, sortie: '2025-11-19', finActive: '2026-06-03', fin: '2027-06-01', precision: 'mois' },
  { major: 22, sortie: '2026-06-03', finActive: '2027-06-01', fin: '2028-06-01', precision: 'mois' },
  { major: 23, sortie: '2027-06-01', finActive: '2028-06-01', fin: '2029-06-01', precision: 'mois', estime: true },
];

// Prérequis par version (Node.js, TypeScript). Clé : "majeure.mineure" ou "majeure" pour toute la ligne.
// Sert au plan de montée de version : chaque étape dit quel Node et quel TypeScript il faut avant de lancer ng update.
export const PREREQUIS = {
  14: { node: '^14.15.0 || ^16.10.0', ts: '>=4.6.2 <4.9.0' },
  15: { node: '^14.20.0 || ^16.13.0 || ^18.10.0', ts: '>=4.8.2 <5.0.0' },
  16: { node: '^16.14.0 || ^18.10.0', ts: '>=4.9.3 <5.2.0' },
  17: { node: '^18.13.0 || ^20.9.0', ts: '>=5.2.0 <5.5.0' },
  18: { node: '^18.19.1 || ^20.11.1 || ^22.0.0', ts: '>=5.4.0 <5.6.0' },
  19: { node: '^18.19.1 || ^20.11.1 || ^22.0.0', ts: '>=5.5.0 <5.9.0' },
  20: { node: '^20.19.0 || ^22.12.0 || ^24.0.0', ts: '>=5.8.0 <6.0.0' },
  21: { node: '^20.19.0 || ^22.12.0 || ^24.0.0', ts: '>=5.9.0 <6.0.0' },
  22: { node: '^22.22.3 || ^24.15.0 || ^26.0.0', ts: '>=6.0.0 <6.1.0' },
};

const JOUR = 86400000;
const d = (s) => new Date(s + 'T00:00:00Z');
export const iso = (date) => date.toISOString().slice(0, 10);

export function version(major) {
  return VERSIONS.find((x) => x.major === major) ?? null;
}

/**
 * État de support d'une majeure à une date.
 * etat : 'active' | 'lts' | 'fin' | 'inconnue' (avant v12 ou au-delà de la table)
 */
export function statut(major, aujourdhui = new Date()) {
  const ver = version(major);
  if (!ver) {
    if (major < VERSIONS[0].major) return { major, etat: 'fin', fin: null, joursRestants: null, note: 'version très ancienne, hors support depuis longtemps' };
    return { major, etat: 'inconnue', fin: null, joursRestants: null, note: 'version absente de la table : mettre à jour support.mjs' };
  }
  const t = aujourdhui.getTime();
  const fin = d(ver.fin), finActive = d(ver.finActive);
  const joursRestants = Math.ceil((fin.getTime() - t) / JOUR);
  const etat = t < d(ver.sortie).getTime() ? 'inconnue' : t < finActive.getTime() ? 'active' : t < fin.getTime() ? 'lts' : 'fin';
  return { major, etat, fin: ver.fin, finActive: ver.finActive, joursRestants, precision: ver.precision ?? 'jour', estime: !!ver.estime };
}

/** Majeures sorties et encore soutenues à cette date, de la plus ancienne à la plus récente. */
export function soutenues(aujourdhui = new Date()) {
  return VERSIONS.filter((x) => ['active', 'lts'].includes(statut(x.major, aujourdhui).etat)).map((x) => x.major);
}

/**
 * Cible conseillée d'une montée de version.
 * 'derniere' : la majeure active la plus récente.
 * 'lts' : la plus ancienne majeure soutenue qui le reste encore au moins `margeJours` (par défaut 180 j).
 */
export function cible(politique = 'lts', aujourdhui = new Date(), margeJours = 180) {
  const s = soutenues(aujourdhui);
  if (!s.length) return null;
  if (politique === 'derniere') return s[s.length - 1];
  return s.find((m) => statut(m, aujourdhui).joursRestants >= margeJours) ?? s[s.length - 1];
}

export function prerequis(major) {
  return PREREQUIS[major] ?? null;
}
