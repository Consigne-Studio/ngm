// Lecture d'un projet Angular client : versions installées, dépendances, scripts, gestionnaire de paquets.
// Lecture seule : rien n'est modifié dans le dépôt.
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { parse, major } from './semver.mjs';

const existe = (p) => access(p).then(() => true, () => false);
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));

export async function lireProjet(dossier) {
  const pkgPath = path.join(dossier, 'package.json');
  if (!(await existe(pkgPath))) throw new Error(`pas de package.json dans ${dossier}`);
  const pkg = await json(pkgPath);

  const gestionnaire = (await existe(path.join(dossier, 'pnpm-lock.yaml'))) ? 'pnpm'
    : (await existe(path.join(dossier, 'yarn.lock'))) ? 'yarn' : 'npm';

  // Versions réellement installées : package-lock (v2/v3), sinon node_modules, sinon la plage déclarée.
  let lock = null;
  if (await existe(path.join(dossier, 'package-lock.json'))) lock = await json(path.join(dossier, 'package-lock.json'));

  const declarees = [
    ...Object.entries(pkg.dependencies ?? {}).map(([name, plage]) => ({ name, plage, dev: false })),
    ...Object.entries(pkg.devDependencies ?? {}).map(([name, plage]) => ({ name, plage, dev: true })),
  ];
  const dependances = [];
  for (const dep of declarees) {
    let version = lock?.packages?.[`node_modules/${dep.name}`]?.version ?? lock?.dependencies?.[dep.name]?.version ?? null;
    let source = version ? 'lock' : null;
    if (!version) {
      const p = path.join(dossier, 'node_modules', dep.name, 'package.json');
      if (await existe(p)) { version = (await json(p)).version; source = 'node_modules'; }
    }
    if (!version) {
      const m = /(\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(dep.plage);
      version = m ? m[1] : null;
      source = 'plage';
    }
    dependances.push({ ...dep, version, source });
  }
  dependances.sort((a, b) => a.name.localeCompare(b.name));

  const core = dependances.find((x) => x.name === '@angular/core');
  const ts = dependances.find((x) => x.name === 'typescript');
  const angularJs = dependances.find((x) => x.name === 'angular');

  return {
    dossier: path.resolve(dossier),
    nom: pkg.name ?? path.basename(dossier),
    gestionnaire,
    lock: !!lock,
    angular: core ? { version: core.version, major: major(core.version) } : null,
    angularJs: angularJs ? { version: angularJs.version } : null,
    typescript: ts?.version ?? null,
    engines: pkg.engines ?? {},
    scripts: pkg.scripts ?? {},
    dependances,
    // Les paquets du framework montent ensemble avec ng update ; le reste se traite paquet par paquet.
    framework: dependances.filter((x) => estFramework(x.name)).map((x) => x.name),
  };
}

export function estFramework(nom) {
  // Ce que `ng update @angular/core @angular/cli` fait monter d'un bloc (TypeScript compris, imposé par le compilateur).
  return /^@angular\/(?!fire$|google-maps$|material|cdk)/.test(nom) || /^@angular-devkit\//.test(nom) || nom === '@schematics/angular' || nom === 'zone.js' || nom === 'typescript';
}

/** Commandes de vérification du client, dans l'ordre : lint, tests, build. Absentes = non lancées. */
export function commandes(projet, surcharge = {}) {
  const s = projet.scripts;
  const run = projet.gestionnaire === 'npm' ? 'npm run' : projet.gestionnaire;
  const pick = (k, ...noms) => surcharge[k] ?? (noms.find((n) => s[n]) ? `${run} ${noms.find((n) => s[n])}` : null);
  let test = pick('test', 'test:ci', 'test');
  // `ng test` seul reste en mode surveillance : on le lance une fois, sans fenêtre de navigateur.
  if (!surcharge.test && test && !s['test:ci'] && /\bng test\b/.test(s.test ?? '') && !/--watch/.test(s.test)) {
    const karma = projet.dependances.some((x) => x.name === 'karma');
    test += ` -- --watch=false${karma ? ' --browsers=ChromeHeadless' : ''}`;
  }
  return {
    lint: pick('lint', 'lint'),
    test,
    build: pick('build', 'build:prod', 'build'),
  };
}

export const versionValide = (v) => !!parse(v ?? '');
