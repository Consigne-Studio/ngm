// Source unique de l'offre : paliers, prix, délais. La page de vente, le rapport mensuel, les CGV
// et le calcul des heures lisent ce fichier ; un test vérifie que les documents ne s'en écartent pas.

export const PALIERS = {
  veille: {
    nom: 'Veille',
    prixHT: 290,
    heures: 1,
    majeure: 'non incluse (sur devis, ou passage au palier Suivi)',
    majeureIncluse: false,
    faillesCritiquesJours: 5,
    reponseJours: 3,
    pour: 'Application stable, peu modifiée, qu’il faut garder saine et surveillée.',
    inclus: [
      'Diagnostic automatique chaque mois : support d’Angular, failles connues, dépendances en retard',
      'Mises à jour sans risque (correctifs et mineures) livrées en demande de fusion, vérifiées par vos tests et votre build',
      'Correctif des failles critiques dans les 5 jours ouvrés quand il ne demande pas de changer de majeure',
      '1 h de correctifs par mois',
      'Rapport mensuel daté (HTML, PDF et Markdown)',
    ],
  },
  suivi: {
    nom: 'Suivi',
    prixHT: 690,
    heures: 4,
    majeure: 'une montée de majeure par semestre, pour rester sur une version soutenue',
    majeureIncluse: true,
    faillesCritiquesJours: 3,
    reponseJours: 2,
    pour: 'Application métier en production qui doit rester sur une version d’Angular soutenue.',
    inclus: [
      'Tout le palier Veille',
      'Une montée de version majeure d’Angular par semestre, bibliothèques tierces comprises',
      'Correctif des failles critiques dans les 3 jours ouvrés',
      '4 h par mois de correctifs ou de petites évolutions',
      'Plan de montée de version tenu à jour dans le rapport',
    ],
  },
  continuite: {
    nom: 'Continuité',
    prixHT: 1390,
    heures: 10,
    majeure: 'chaque nouvelle majeure dans les 60 jours après sa sortie',
    majeureIncluse: true,
    faillesCritiquesJours: 2,
    reponseJours: 1,
    pour: 'Application critique, équipe interne ou prestataires qui continuent de développer dessus.',
    inclus: [
      'Tout le palier Suivi',
      'Passage à chaque nouvelle majeure dans les 60 jours après sa sortie',
      'Correctif des failles critiques dans les 2 jours ouvrés',
      '10 h par mois : correctifs, évolutions, modernisation progressive (signals, control flow, sans zone)',
      'Relecture écrite des demandes de fusion de votre équipe, dans les heures du forfait',
    ],
  },
};

export const CONDITIONS = {
  heureSupHT: 95,
  facturation: 'par trimestre, à échoir (3 mois payés d’avance)',
  engagementMois: 3,
  resiliation: 'à tout moment, effet à la fin du trimestre payé, sans frais',
  reportHeuresMois: 1,
  auditDeduitJours: 30,
  applicationSupplementaire: 0.5, // +50 % par application supplémentaire dans le même dépôt
  retardMaxMajeures: 2, // au-delà, remise à niveau sur devis avant l'abonnement
  horaires: 'jours ouvrés, 9 h – 18 h, heure de Paris',
  canal: 'par écrit uniquement (e-mail et tickets du dépôt), 100 % à distance',
};

export const EXCLUSIONS = [
  'Intervention sur site, réunions et formation : tout se fait à distance et par écrit.',
  'Astreinte, soirs, week-ends et jours fériés.',
  'Accès à la production, déploiement et hébergement : vous déployez, nous livrons des demandes de fusion.',
  'Back-end, base de données et infrastructure (sauf la configuration de build et de CI du front Angular).',
  'Refonte, nouvelles fonctionnalités importantes, migration AngularJS : sur devis séparé.',
  'Garantie de conformité réglementaire (CRA, NIS2, RGAA) : le rapport aide à la démontrer, il ne la certifie pas.',
];

export function palier(cle) {
  const p = PALIERS[cle];
  if (!p) throw new Error(`palier inconnu : ${cle} (veille, suivi ou continuite)`);
  return { cle, ...p };
}

export const euros = (n) => `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} €`;
