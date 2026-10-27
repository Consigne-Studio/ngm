// Diagnostic mensuel : état de support d'Angular, dépendances en retard, failles connues, actions priorisées.
// Lecture seule. Sortie : un objet « état » (écrit en etat.json) que le plan et le rapport réutilisent.
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { lireProjet, estFramework } from './projet.mjs';
import { statut, cible, prerequis, iso, RELEVE } from './support.mjs';
import { ecart, satisfies } from './semver.mjs';
import * as registre from './registre.mjs';
import { OUTIL } from './outil.mjs';

const RANG = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
export const GRAVITE_FR = { critical: 'critique', high: 'haute', moderate: 'moyenne', low: 'faible', info: 'info' };

/**
 * @param {string} dossier  racine du projet client
 * @param {object} o
 *   date         Date du diagnostic (défaut : maintenant)
 *   politique    'lts' | 'derniere' (cible de montée de version)
 *   perimees     sortie de `npm outdated --json` déjà obtenue (sinon lancée)
 *   audit        sortie de `npm audit --json` déjà obtenue (sinon lancée)
 *   reference    chemin d'un audit.json (offre d'audit DEV-602) ; par défaut <dossier>/audit.json s'il existe
 */
export async function diagnostiquer(dossier, o = {}) {
  const date = o.date ?? new Date();
  const projet = await lireProjet(dossier);
  const [perimees, audit] = await Promise.all([
    o.perimees ?? registre.perimees(dossier),
    o.audit ?? registre.audit(dossier),
  ]);

  const dependances = projet.dependances.map((d) => {
    const p = perimees[d.name];
    const courante = p?.current ?? d.version;
    return {
      name: d.name,
      dev: d.dev,
      version: courante,
      voulue: p?.wanted ?? courante,
      derniere: p?.latest ?? courante,
      // « sûre » : dans la plage déclarée (patch/mineure), appliquée sans revue par `appliquer`.
      sure: p ? ecart(courante, p.wanted) : null,
      retard: p ? ecart(courante, p.latest) : null,
      framework: estFramework(d.name),
    };
  });

  const vulnerabilites = lireAudit(audit);
  const support = projet.angular ? statut(projet.angular.major, date) : null;
  const versCible = cible(o.politique ?? 'lts', date);
  const reference = await lireReference(o.reference ?? path.join(dossier, 'audit.json'));

  const etat = {
    outil: OUTIL,
    date: iso(date),
    releveSupport: RELEVE,
    projet: {
      nom: projet.nom,
      gestionnaire: projet.gestionnaire,
      lock: projet.lock,
      angular: projet.angular,
      typescript: projet.typescript,
      angularJs: projet.angularJs,
      engines: projet.engines,
    },
    support,
    cible: versCible,
    dependances,
    vulnerabilites,
    reference,
  };
  etat.indicateurs = indicateurs(etat);
  etat.actions = actions(etat, projet);
  return etat;
}

export function lireAudit(audit) {
  const meta = audit?.metadata?.vulnerabilities ?? {};
  const avis = new Map();
  const directes = [];
  for (const [nom, v] of Object.entries(audit?.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via !== 'object') continue;
      const cle = via.url ?? `${via.name}:${via.title}`;
      if (!avis.has(cle)) avis.set(cle, { paquet: via.name, titre: via.title, url: via.url ?? null, gravite: via.severity, plage: via.range, cvss: via.cvss?.score ?? null });
    }
    if (v.isDirect) {
      const fix = v.fixAvailable;
      directes.push({
        name: nom,
        gravite: v.severity,
        correctif: fix === true ? { sansMajeure: true } : fix && typeof fix === 'object' ? { version: fix.version, majeure: !!fix.isSemVerMajor } : null,
      });
    }
  }
  const tri = (a, b) => RANG[a.gravite] - RANG[b.gravite] || a.paquet?.localeCompare?.(b.paquet ?? '') || 0;
  return {
    total: meta.total ?? 0,
    critical: meta.critical ?? 0,
    high: meta.high ?? 0,
    moderate: meta.moderate ?? 0,
    low: meta.low ?? 0,
    info: meta.info ?? 0,
    avis: [...avis.values()].sort(tri),
    directes: directes.sort((a, b) => RANG[a.gravite] - RANG[b.gravite] || a.name.localeCompare(b.name)),
  };
}

async function lireReference(chemin) {
  try {
    await access(chemin);
  } catch {
    return null;
  }
  try {
    const a = JSON.parse(await readFile(chemin, 'utf8'));
    return {
      chemin,
      date: a.date ?? a.generatedAt ?? null,
      angular: a.angular?.version ?? null,
      constats: (a.findings ?? []).map((f) => ({ id: f.id, gravite: f.severity, titre: f.title, axe: f.axe ?? null, nombre: f.count ?? null })),
    };
  } catch (e) {
    return { chemin, erreur: `audit.json illisible : ${e.message}` };
  }
}

function indicateurs(etat) {
  const deps = etat.dependances;
  const majeurs = deps.filter((d) => d.retard === 'major').length;
  return {
    dependances: deps.length,
    aJour: deps.filter((d) => !d.retard).length,
    retardMajeur: majeurs,
    misesAJourSures: deps.filter((d) => d.sure).length,
    // Part des dépendances sans retard de version majeure.
    santeDependances: deps.length ? Math.round((100 * (deps.length - majeurs)) / deps.length) : 100,
    failles: etat.vulnerabilites.total,
    faillesGraves: etat.vulnerabilites.critical + etat.vulnerabilites.high,
  };
}

function actions(etat, projet) {
  const out = [];
  const a = (priorite, code, titre, detail = null) => out.push({ priorite, code, titre, detail });
  const s = etat.support;

  if (projet.angularJs) a('P1', 'angularjs', `AngularJS ${projet.angularJs.version} présent : hors support depuis le 2021-12-31`, 'Migration à chiffrer séparément (hors abonnement).');
  if (!projet.angular) a('P1', 'pas-angular', "@angular/core introuvable dans package.json : ce n'est pas un projet Angular");
  else if (s.etat === 'fin') a('P1', 'eol', `Angular ${s.major} n'est plus soutenu${s.fin ? ` depuis le ${s.fin}` : ''}`, `Plus aucun correctif de sécurité. Cible conseillée : Angular ${etat.cible}.`);
  else if (s.etat === 'lts' && s.joursRestants <= 90) a('P2', 'eol-proche', `Angular ${s.major} sort du support dans ${s.joursRestants} jours (${s.fin})`, `Planifier la montée vers Angular ${etat.cible}.`);
  else if (s.etat === 'lts') a('P3', 'lts', `Angular ${s.major} en support long jusqu'au ${s.fin}`, 'Correctifs critiques seulement ; prévoir la prochaine majeure.');
  else if (s.etat === 'inconnue') a('P3', 'support-inconnu', `Angular ${s.major} absent de la table de support (relevé du ${etat.releveSupport})`);

  const v = etat.vulnerabilites;
  const parGravite = (g) => v.directes.filter((d) => d.gravite === g);
  const indirectes = (g) => [...new Set(v.avis.filter((x) => x.gravite === g).map((x) => x.paquet))].join(', ');
  // Les paquets du framework sont corrigés par la montée de version : on les regroupe pour garder la ligne lisible.
  const liste = (ds) => {
    const fw = ds.filter((d) => estFramework(d.name) || /^@angular\/(material|cdk)$/.test(d.name));
    const autres = ds.filter((d) => !fw.includes(d));
    const parts = autres.map((d) => d.name + (d.correctif?.version ? ` → ${d.correctif.version}${d.correctif.majeure ? ' (majeure)' : ''}` : d.correctif?.sansMajeure ? ' (correctif sans majeure)' : ''));
    if (fw.length) parts.unshift(`${fw.length} paquet(s) Angular, corrigés par la montée de version`);
    return parts.join(' ; ');
  };
  if (v.critical) a('P1', 'failles-critiques', `${v.critical} faille(s) critique(s) connue(s)`, liste(parGravite('critical')) || `dépendances indirectes : ${indirectes('critical')}`);
  if (v.high) a('P2', 'failles-hautes', `${v.high} faille(s) de gravité haute`, liste(parGravite('high')) || `dépendances indirectes : ${indirectes('high')}`);
  if (v.moderate || v.low) a('P3', 'failles-autres', `${v.moderate + v.low} faille(s) moyenne(s) ou faible(s)`);

  if (projet.angular && etat.projet.typescript) {
    const pr = prerequis(projet.angular.major);
    if (pr && !satisfies(etat.projet.typescript, pr.ts)) a('P2', 'typescript', `TypeScript ${etat.projet.typescript} hors de la plage d'Angular ${projet.angular.major} (${pr.ts})`);
  }

  const sures = etat.dependances.filter((d) => d.sure);
  if (sures.length) a('P4', 'sures', `${sures.length} mise(s) à jour sans risque disponible(s) dans les plages déclarées`, sures.map((d) => `${d.name} ${d.version} → ${d.voulue}`).join(', '));
  const majeurs = etat.dependances.filter((d) => d.retard === 'major' && !d.framework && !/^@angular\/(material|cdk)$/.test(d.name));
  if (majeurs.length) a('P3', 'majeures', `${majeurs.length} bibliothèque(s) en retard d'une version majeure (hors Angular)`, majeurs.map((d) => `${d.name} ${d.version} → ${d.derniere}`).join(', '));

  return out.sort((x, y) => x.priorite.localeCompare(y.priorite));
}
