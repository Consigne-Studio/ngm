// Plan de montée de version : une majeure à la fois (règle d'Angular), avec pour chaque étape
// les prérequis Node/TypeScript, les commandes, les bibliothèques tierces à faire suivre et une estimation.
import { prerequis, statut } from './support.mjs';
import { satisfies, maxSatisfying, major as majeureDe, parse } from './semver.mjs';
import * as registre from './registre.mjs';
import { executer } from './executer.mjs';

// Points d'attention par majeure : courts, vérifiables dans le guide officiel, jamais exhaustifs.
export const NOTES = {
  15: ['Composants autonomes (standalone) stables.', 'Material : migration vers les composants MDC (`ng generate @angular/material:mdc-migration`), à recetter visuellement.'],
  16: ['Signals en préversion ; `ngcc` supprimé : les bibliothèques View Engine ne fonctionnent plus.', 'Node 16.14 ou 18.10 minimum.'],
  17: ['Nouveau control flow (`@if`, `@for`) disponible ; migration facultative `ng generate @angular/core:control-flow`.', 'Node 18.13 minimum.'],
  18: ['Material 3 par défaut dans les nouveaux thèmes : les thèmes M2 existants restent valides.', 'Mode sans zone (zoneless) expérimental.'],
  19: ['`standalone: true` devient la valeur par défaut : la migration ajoute `standalone: false` aux composants déclarés dans un NgModule.', 'Entrées signal, `linkedSignal` et `resource` apparaissent.'],
  20: ['Node 20.19, 22.12 ou 24 requis ; TypeScript 5.8 minimum.', 'Les directives structurelles `*ngIf`, `*ngFor`, `*ngSwitch` sont dépréciées : migration conseillée vers le control flow.', 'Effets, `linkedSignal` et `toSignal` stables.'],
  21: ['Les nouveaux projets sont sans zone et testés avec Vitest ; les projets existants gardent zone.js et Karma tant qu\'on ne migre pas.', 'TypeScript 5.9 requis.'],
  22: ['TypeScript 6.0 et Node 22.22 ou 24.15 minimum.', 'Relire les dépréciations signalées par `ng update` en v21 : elles sont supprimées ici.'],
};

const HEURES = { base: 3, parBibliotheque: 1.5, sauteNode: 1 };

/**
 * @param etat       sortie de diagnostiquer()
 * @param o.vers     majeure cible (défaut : etat.cible)
 * @param o.versions (nom) => Promise<[{version, pairs}]> ; par défaut le registre npm
 * @param o.node     version de Node de la machine qui fera la montée (défaut : process.version)
 */
export async function planifier(etat, o = {}) {
  const de = etat.projet.angular?.major;
  if (!de) throw new Error("pas de version d'Angular détectée");
  const vers = o.vers ?? etat.cible;
  const versions = o.versions ?? ((n, depuis) => registre.versionsAvecPairs(n, { depuis }));
  const node = (o.node ?? process.version).replace(/^v/, '');
  const npm = o.npm ?? (await executer('npm', ['--version'])).stdout.trim();

  const plan = { de, vers, depuis: etat.projet.angular.version, etapes: [], bloquants: [], heures: 0, guide: null };
  if (vers <= de) {
    plan.message = `Angular ${de} est déjà au niveau de la cible (${vers}). Rien à monter ; seules les mises à jour mineures s'appliquent.`;
    return plan;
  }
  plan.guide = `https://angular.dev/update-guide?v=${de}.0-${vers}.0&l=2`;

  // Bibliothèques tierces qui déclarent une dépendance de pair sur Angular : elles doivent suivre chaque étape.
  const tierces = etat.dependances.filter((d) => !d.framework);
  const infos = new Map();
  for (const d of tierces) {
    try {
      const liste = await versions(d.name, majeureDe(d.version) ?? 0);
      if (liste.some((x) => x.pairs['@angular/core'])) infos.set(d.name, liste);
    } catch (e) {
      plan.bloquants.push(`Lecture impossible de ${d.name} sur le registre : ${e.message}`);
    }
  }
  const material = etat.dependances.some((d) => d.name === '@angular/material');
  const cdkSeul = !material && etat.dependances.some((d) => d.name === '@angular/cdk');
  let nodeCourant = node;
  // Observé le 2026-10-23 : Material, PrimeNG ou NgRx déclarés en devDependencies font échouer ng update sur les
  // dépendances de pair (« @angular/common requires @angular/core 21 ») ; en dependencies, la même commande passe.
  const enDev = etat.dependances.filter((d) => d.dev && (/^@angular\/(material|cdk)$/.test(d.name) || infos.has(d.name))).map((d) => d.name);

  const actuelles = new Map(tierces.map((d) => [d.name, d.version]));
  for (let n = de + 1; n <= vers; n++) {
    const pr = prerequis(n);
    const etape = { vers: n, prerequis: pr, commandes: [], bibliotheques: [], notes: NOTES[n] ?? [], alertes: [], heures: HEURES.base };
    if (pr && !satisfies(nodeCourant, pr.node)) {
      etape.alertes.push(`Node ${nodeCourant} ne convient pas à Angular ${n} (${pr.node}) : installer une version compatible avant ng update, et la mettre aussi dans la CI.`);
      etape.heures += HEURES.sauteNode;
      nodeCourant = premiereNode(pr.node);
    }
    // Observé le 2026-10-23 sur une vraie montée 20 → 21 : npm 10.9 plante (« reading 'edgesOut' ») sur les
    // dépendances de pair facultatives d'@angular/build 21 ; npm 11 installe sans erreur.
    if (enDev.length && n === de + 1) etape.alertes.push(`${enDev.join(', ')} ${enDev.length > 1 ? 'sont' : 'est'} en devDependencies : ng update échoue alors sur les dépendances de pair. Les déplacer dans dependencies (npm install ${enDev.join(' ')} --save-prod), commiter, puis relancer.`);
    if (n >= 21 && parse(npm)?.major < 11) etape.alertes.push(`npm ${npm} échoue à installer Angular ${n} (bogue connu de npm 10) : passer à npm 11 (\`npm install -g npm@11\`), aussi dans la CI.`);
    // Tout dans un seul ng update : les dépendances de pair se résolvent ensemble. Séparées, une bibliothèque
    // qui exige l'ancienne majeure (NgRx, PrimeNG…) fait échouer l'installation de la nouvelle.
    const ensemble = [`@angular/core@${n}`, `@angular/cli@${n}`, ...(material ? [`@angular/material@${n}`] : cdkSeul ? [`@angular/cdk@${n}`] : [])];

    for (const [nom, liste] of infos) {
      if (nom === '@angular/material' || nom === '@angular/cdk') continue;
      const compatibles = liste.filter((x) => accepteMajeure(x.pairs['@angular/core'], n)).map((x) => x.version);
      const actuelle = actuelles.get(nom);
      const dejaOk = compatibles.includes(actuelle);
      const conseillee = maxSatisfying(compatibles, '*');
      if (!conseillee) {
        etape.bibliotheques.push({ name: nom, actuelle, conseillee: null, majeure: false });
        plan.bloquants.push(`${nom} n'a pas encore de version compatible avec Angular ${n}.`);
        continue;
      }
      if (dejaOk && majeureDe(conseillee) === majeureDe(actuelle)) continue;
      const changeMajeure = majeureDe(conseillee) !== majeureDe(actuelle);
      etape.bibliotheques.push({ name: nom, actuelle, conseillee, majeure: changeMajeure });
      ensemble.push(`${nom}@${conseillee}`);
      if (changeMajeure) etape.heures += HEURES.parBibliotheque;
      actuelles.set(nom, conseillee);
    }
    etape.commandes.push(`npx ng update ${ensemble.join(' ')}`);
    etape.commandes.push('# puis : lint, tests, build, recette, commit « chore: Angular ' + n + ' »');
    plan.etapes.push(etape);
    plan.heures += etape.heures;
  }
  const s = statut(vers);
  plan.cibleSupport = s;
  return plan;
}

/** Une plage de pair accepte-t-elle au moins une version de la majeure n ? */
export function accepteMajeure(plage, n) {
  if (!plage) return false;
  return [`${n}.0.0`, `${n}.0.9`, `${n}.1.0`, `${n}.2.0`, `${n}.3.0`, `${n}.99.99`].some((v) => satisfies(v, plage));
}

function premiereNode(plage) {
  const m = /(\d+\.\d+\.\d+)/.exec(plage);
  return m && parse(m[1]) ? m[1] : '0.0.0';
}
