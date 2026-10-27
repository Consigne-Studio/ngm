// Application des mises à jour sur une branche dédiée, vérifiées par les commandes du client (lint, tests, build).
// Deux modes :
//   sures    : versions patch et mineures dans les plages déclarées + `npm audit fix` sans --force.
//              Si la vérification échoue, chaque paquet est retenté seul : on garde ceux qui passent.
//   majeure  : une étape du plan (ng update vers la majeure suivante + bibliothèques tierces).
// Rien n'est poussé sans --pousser. La branche de départ n'est jamais modifiée.
import { executer, executerLigne } from './executer.mjs';
import { lireProjet, commandes as commandesDe } from './projet.mjs';
import { diagnostiquer } from './diagnostic.mjs';
import { planifier } from './plan.mjs';

const git = (cwd, ...args) => executer('git', args, { cwd });

async function gitOk(cwd, ...args) {
  const r = await git(cwd, ...args);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} : ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

export async function verifier(dossier, cmds, { journal } = {}) {
  const resultats = [];
  for (const etape of ['lint', 'test', 'build']) {
    const ligne = cmds[etape];
    if (!ligne) { resultats.push({ etape, statut: 'absente' }); continue; }
    const t0 = Date.now();
    const r = await executerLigne(ligne, { cwd: dossier });
    const res = { etape, commande: ligne, statut: r.code === 0 ? 'ok' : 'echec', secondes: Math.round((Date.now() - t0) / 1000) };
    if (r.code !== 0) res.extrait = (r.stdout + r.stderr).trim().split('\n').slice(-25).join('\n');
    resultats.push(res);
    journal?.push(`${etape} : ${res.statut} (${res.secondes} s)`);
    if (r.code !== 0) break;
  }
  return { ok: resultats.every((x) => x.statut !== 'echec'), resultats };
}

async function preparerBranche(dossier, branche) {
  const etatGit = await git(dossier, 'status', '--porcelain');
  if (etatGit.code !== 0) throw new Error(`${dossier} n'est pas un dépôt git`);
  if (etatGit.stdout.trim()) throw new Error('le dépôt a des modifications non commitées : commitez ou remisez-les avant de lancer la maintenance');
  const depart = await gitOk(dossier, 'rev-parse', '--abbrev-ref', 'HEAD');
  const existe = (await git(dossier, 'rev-parse', '--verify', '--quiet', branche)).code === 0;
  if (existe) throw new Error(`la branche ${branche} existe déjà : supprimez-la ou choisissez --branche`);
  await gitOk(dossier, 'checkout', '-q', '-b', branche);
  return depart;
}

async function annulerModifs(dossier) {
  await git(dossier, 'checkout', '-q', '--', '.');
  // node_modules n'est pas versionné : on le resynchronise avec le package-lock restauré.
  await executer('npm', ['install', '--no-fund', '--no-audit'], { cwd: dossier });
}

async function installer(dossier, specs) {
  if (!specs.length) return { code: 0, stdout: '' };
  return executer('npm', ['install', '--no-fund', '--no-audit', ...specs], { cwd: dossier });
}

async function commit(dossier, message) {
  await gitOk(dossier, 'add', '-A');
  const vide = (await git(dossier, 'diff', '--cached', '--quiet')).code === 0;
  if (vide) return null;
  await gitOk(dossier, '-c', 'user.name=consigne-ngm', '-c', 'user.email=ngm@localhost', 'commit', '-q', '--author', await auteur(dossier), '-m', message);
  return gitOk(dossier, 'rev-parse', '--short', 'HEAD');
}

// L'auteur du commit reste la personne configurée dans le dépôt ; l'outil ne signe qu'à défaut.
async function auteur(dossier) {
  const n = (await git(dossier, 'config', 'user.name')).stdout.trim();
  const e = (await git(dossier, 'config', 'user.email')).stdout.trim();
  return n && e ? `${n} <${e}>` : 'consigne-ngm <ngm@localhost>';
}

const mois = (d) => d.toISOString().slice(0, 7);

/** Mode « sures ». o : { date, branche, commandes, pousser, etat } */
export async function appliquerSures(dossier, o = {}) {
  const date = o.date ?? new Date();
  const branche = o.branche ?? `maintenance/${mois(date)}`;
  const journal = [];
  const projet = await lireProjet(dossier);
  const cmds = commandesDe(projet, o.commandes);
  const etat = o.etat ?? (await diagnostiquer(dossier, { date }));
  const candidats = etat.dependances.filter((d) => d.sure).map((d) => ({ name: d.name, de: d.version, vers: d.voulue }));

  const depart = await preparerBranche(dossier, branche);
  const res = { mode: 'sures', branche, depart, appliquees: [], rejetees: [], auditFix: null, verification: null, commit: null, journal };

  const essayer = async (lot) => {
    const r = await installer(dossier, lot.map((c) => `${c.name}@${c.vers}`));
    if (r.code !== 0) return { ok: false, resultats: [{ etape: 'install', statut: 'echec', extrait: (r.stderr || r.stdout).trim().split('\n').slice(-15).join('\n') }] };
    return verifier(dossier, cmds, { journal });
  };

  if (candidats.length) {
    journal.push(`essai groupé : ${candidats.map((c) => c.name).join(', ')}`);
    const v = await essayer(candidats);
    if (v.ok) res.appliquees.push(...candidats);
    else {
      journal.push('échec groupé : essai paquet par paquet');
      await annulerModifs(dossier);
      for (const c of candidats) {
        const vi = await essayer([...res.appliquees, c]);
        if (vi.ok) res.appliquees.push(c);
        else {
          res.rejetees.push({ ...c, raison: vi.resultats.find((x) => x.statut === 'echec') });
          await annulerModifs(dossier);
          if (res.appliquees.length) await installer(dossier, res.appliquees.map((x) => `${x.name}@${x.vers}`));
        }
      }
    }
  }

  // Correctifs de failles sans changement de majeure.
  const avant = etat.vulnerabilites.total;
  const fix = await executer('npm', ['audit', 'fix', '--no-fund'], { cwd: dossier });
  const apresAudit = await executer('npm', ['audit', '--json'], { cwd: dossier });
  let apres = avant;
  try { apres = JSON.parse(apresAudit.stdout).metadata.vulnerabilities.total; } catch { /* audit indisponible */ }
  res.auditFix = { avant, apres, code: fix.code };

  res.verification = await verifier(dossier, cmds, { journal });
  if (!res.verification.ok && apres !== avant) {
    // `npm audit fix` a cassé quelque chose : on revient aux seules mises à jour validées.
    journal.push('npm audit fix casse la vérification : annulé');
    await annulerModifs(dossier);
    if (res.appliquees.length) await installer(dossier, res.appliquees.map((x) => `${x.name}@${x.vers}`));
    res.auditFix.annule = true;
    res.auditFix.apres = avant;
    res.verification = await verifier(dossier, cmds, { journal });
  }

  if (res.verification.ok) {
    const lignes = res.appliquees.map((c) => `- ${c.name} ${c.de} → ${c.vers}`);
    if (res.auditFix.apres < avant) lignes.push(`- npm audit fix : ${avant} → ${res.auditFix.apres} failles`);
    res.commit = await commit(dossier, `chore(deps): maintenance ${mois(date)}\n\n${lignes.join('\n') || '- aucune modification'}\n\nVérifié : ${res.verification.resultats.filter((x) => x.statut === 'ok').map((x) => x.etape).join(', ')}.`);
  } else {
    await annulerModifs(dossier);
  }
  if (o.pousser && res.commit) res.poussee = await pousser(dossier, branche);
  if (!o.garderBranche) await git(dossier, 'checkout', '-q', depart);
  return res;
}

/** Mode « majeure » : une seule étape, vers la majeure suivante. o : { vers, date, branche, commandes, pousser, node } */
export async function appliquerMajeure(dossier, o = {}) {
  const date = o.date ?? new Date();
  const journal = [];
  const projet = await lireProjet(dossier);
  const cmds = commandesDe(projet, o.commandes);
  const etat = o.etat ?? (await diagnostiquer(dossier, { date }));
  const vers = o.vers ?? etat.projet.angular.major + 1;
  if (vers !== etat.projet.angular.major + 1) throw new Error(`une majeure à la fois : Angular ${etat.projet.angular.major} → ${etat.projet.angular.major + 1} d'abord`);
  const plan = await planifier(etat, { vers, node: o.node, npm: o.npm });
  const etape = plan.etapes[0];
  if (plan.bloquants.length) return { mode: 'majeure', vers, bloque: plan.bloquants, journal };
  if (etape.alertes.length && !o.forcer) return { mode: 'majeure', vers, bloque: etape.alertes, journal };

  const branche = o.branche ?? `maintenance/angular-${vers}`;
  const depart = await preparerBranche(dossier, branche);
  const res = { mode: 'majeure', vers, branche, depart, commandes: [], verification: null, commit: null, journal };
  const env = { NG_CLI_ANALYTICS: 'false', CI: '1' };

  for (const c of etape.commandes.filter((x) => !x.startsWith('#'))) {
    const r = await executerLigne(c, { cwd: dossier, env });
    res.commandes.push({ commande: c, code: r.code, extrait: r.stdout.trim().split('\n').slice(-12).join('\n') });
    journal.push(`${c} : ${r.code === 0 ? 'ok' : 'échec'}`);
    if (r.code !== 0) {
      res.echec = c;
      break;
    }
    // ng update exige un arbre propre entre deux paquets : on commite chaque étape.
    await commit(dossier, `chore: ${c.replace(/^npx /, '')}`);
  }
  if (!res.echec) {
    res.verification = await verifier(dossier, cmds, { journal });
    if (res.verification.ok) res.commit = await gitOk(dossier, 'rev-parse', '--short', 'HEAD');
  }
  // En cas d'échec la branche reste telle quelle : c'est le travail manuel, compté dans les heures du forfait.
  if (o.pousser && res.commit) res.poussee = await pousser(dossier, branche);
  if (!o.garderBranche && res.commit) await git(dossier, 'checkout', '-q', depart);
  return res;
}

async function pousser(dossier, branche) {
  const r = await git(dossier, 'push', '-u', 'origin', branche);
  return { code: r.code, message: (r.stderr || r.stdout).trim().split('\n').slice(-3).join('\n') };
}
