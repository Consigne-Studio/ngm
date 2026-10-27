#!/usr/bin/env node
// consigne-ngm : outil de maintenance mensuelle des applications Angular (offre DEV-603).
// Aucune dépendance : Node 20+, npm et git suffisent.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { diagnostiquer } from '../src/diagnostic.mjs';
import { planifier } from '../src/plan.mjs';
import { appliquerSures, appliquerMajeure } from '../src/appliquer.mjs';
import { ecrireRapport, rapportMarkdown } from '../src/rapport.mjs';
import { lireFichier, ajouter, bilan, hm } from '../src/heures.mjs';
import { portefeuille, portefeuilleMarkdown } from '../src/portefeuille.mjs';
import { OUTIL } from '../src/outil.mjs';

const AIDE = `${OUTIL.nom} ${OUTIL.version} — maintenance mensuelle d'applications Angular

Commandes (dossier = racine du projet Angular, par défaut le dossier courant) :
  diagnostic [dossier]            État de support, failles, dépendances, actions P1–P4
      --json <fichier>            écrit l'état complet (sinon résumé à l'écran)
      --politique lts|derniere    cible de montée de version (défaut : lts)
      --markdown <fichier>        écrit un résumé Markdown (corps d'issue ou de demande de fusion)
      --echec-si P1|P2            code de sortie 2 s'il existe une action de cette priorité ou plus grave (CI)
  plan [dossier] [--vers N]       Plan de montée de version, une majeure à la fois
  sures [dossier]                 Mises à jour sans risque sur une branche maintenance/AAAA-MM, vérifiées
      --pousser                   pousse la branche si tout est vert
      --json <fichier>            écrit le compte rendu (pour le rapport)
  majeure [dossier] --vers N      Montée vers la majeure suivante sur la branche maintenance/angular-N
  rapport [dossier] --fiche <client.json>  Rapport mensuel HTML + Markdown (+ PDF si Chrome est présent)
      --travaux <a.json,b.json>   comptes rendus de sures / majeure
      --sortie <dossier>          défaut : ./suivi/AAAA-MM
  mois --fiche <client.json>      Routine complète du mois : diagnostic, sures, plan, rapport
  heures ajouter --fichier <csv> --minutes 45 --type correctif --description "…" [--ref #12] [--date AAAA-MM-JJ]
  heures bilan --fichier <csv> --palier veille|suivi|continuite [--mois AAAA-MM]
  portefeuille <dossier-clients>  Tableau de bord de tous les clients (fiches *.client.json)

Options communes : --date AAAA-MM-JJ (date du diagnostic), --aide`;

const { values: o, positionals: pos } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'string' }, markdown: { type: 'string' }, politique: { type: 'string' }, 'echec-si': { type: 'string' }, vers: { type: 'string' },
    pousser: { type: 'boolean' }, fiche: { type: 'string' }, travaux: { type: 'string' }, sortie: { type: 'string' },
    fichier: { type: 'string' }, minutes: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' },
    ref: { type: 'string' }, date: { type: 'string' }, palier: { type: 'string' }, mois: { type: 'string' },
    branche: { type: 'string' }, aide: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }, 'sans-pdf': { type: 'boolean' },
  },
});

const date = o.date ? new Date(o.date + 'T12:00:00Z') : new Date();
const lireJSON = async (f) => JSON.parse(await readFile(f, 'utf8'));
const ecrireJSON = async (f, d) => { await mkdir(path.dirname(path.resolve(f)), { recursive: true }); await writeFile(f, JSON.stringify(d, null, 2) + '\n'); };

async function lireFiche(f) {
  const fiche = await lireJSON(f);
  for (const k of ['client', 'application', 'palier', 'depot']) if (!fiche[k]) throw new Error(`fiche ${f} : champ « ${k} » manquant`);
  fiche.depot = path.resolve(path.dirname(f), fiche.depot);
  fiche.interventions = fiche.interventions ? path.resolve(path.dirname(f), fiche.interventions) : null;
  fiche.suivi = path.resolve(path.dirname(f), fiche.suivi ?? 'suivi');
  return fiche;
}

function resume(etat) {
  const s = etat.support;
  const l = [`${etat.projet.nom} · Angular ${etat.projet.angular?.version ?? '?'} · ${s ? ({ active: 'support actif', lts: 'support long', fin: 'HORS SUPPORT', inconnue: 'support inconnu' })[s.etat] : ''}${s?.fin ? ` (fin ${s.fin})` : ''}`,
    `Failles : ${etat.vulnerabilites.total} (${etat.vulnerabilites.critical} critiques, ${etat.vulnerabilites.high} hautes) · dépendances sans retard majeur : ${etat.indicateurs.santeDependances} % · cible conseillée : Angular ${etat.cible}`, ''];
  for (const a of etat.actions) l.push(`  ${a.priorite}  ${a.titre}${a.detail ? `\n      ${a.detail}` : ''}`);
  return l.join('\n');
}

function resumePlan(plan) {
  if (!plan.etapes.length) return plan.message;
  const l = [`Angular ${plan.depuis} → ${plan.vers} : ${plan.etapes.length} étape(s), ≈ ${plan.heures} h. Guide officiel : ${plan.guide}`];
  for (const e of plan.etapes) {
    l.push('', `▸ Angular ${e.vers}  (Node ${e.prerequis?.node ?? '?'}, TypeScript ${e.prerequis?.ts ?? '?'}, ≈ ${e.heures} h)`);
    for (const a of e.alertes) l.push(`  ! ${a}`);
    for (const c of e.commandes) l.push(`  ${c}`);
    for (const n of e.notes) l.push(`  · ${n}`);
  }
  if (plan.bloquants.length) l.push('', 'Bloquants :', ...plan.bloquants.map((b) => `  ✗ ${b}`));
  return l.join('\n');
}

async function routineMois(fiche) {
  const mois = o.mois ?? date.toISOString().slice(0, 7);
  const sortie = path.join(fiche.suivi, mois);
  await mkdir(sortie, { recursive: true });
  console.log(`▸ ${fiche.client} · ${fiche.application} · ${mois}`);
  const avant = await diagnostiquer(fiche.depot, { date, politique: fiche.politique });
  await ecrireJSON(path.join(sortie, 'etat-avant.json'), avant);
  console.log(resume(avant));
  console.log('\n▸ Mises à jour sans risque');
  const travaux = [await appliquerSures(fiche.depot, { date, etat: avant, commandes: fiche.commandes, pousser: fiche.pousser ?? o.pousser, branche: o.branche })];
  await ecrireJSON(path.join(sortie, 'sures.json'), travaux[0]);
  const t = travaux[0];
  console.log(`  ${t.appliquees.length} appliquée(s), ${t.rejetees.length} écartée(s), failles ${t.auditFix.avant} → ${t.auditFix.apres}, ${t.commit ? `commit ${t.commit} sur ${t.branche}` : 'aucun commit'}`);
  // L'état du rapport est celui de la branche de maintenance (ce que le client recevra en fusionnant).
  let apres = avant;
  if (t.commit) {
    const { executer } = await import('../src/executer.mjs');
    await executer('git', ['checkout', '-q', t.branche], { cwd: fiche.depot });
    try { apres = await diagnostiquer(fiche.depot, { date, politique: fiche.politique }); }
    finally { await executer('git', ['checkout', '-q', t.depart], { cwd: fiche.depot }); await executer('npm', ['install', '--no-audit', '--no-fund'], { cwd: fiche.depot }); }
  }
  await ecrireJSON(path.join(sortie, 'etat.json'), apres);
  const plan = await planifier(apres, { node: fiche.node });
  await ecrireJSON(path.join(sortie, 'plan.json'), plan);
  const heures = fiche.interventions ? bilan(await lireFichier(fiche.interventions), mois, fiche.palier) : null;
  const r = await ecrireRapport(sortie, { etat: apres, plan, client: fiche, travaux, heures, mois, pdf: !o['sans-pdf'] });
  console.log(`\n▸ Rapport : ${r.html}${r.pdf ? `\n           ${r.pdf}` : ' (PDF : Chrome introuvable, imprimez le HTML)'}\n           ${r.md}`);
  return r;
}

async function main() {
  const [cmd, ...reste] = pos;
  if (o.version) return console.log(OUTIL.version);
  if (!cmd || o.aide) return console.log(AIDE);
  const dossier = path.resolve(reste[0] ?? '.');
  switch (cmd) {
    case 'diagnostic': {
      const etat = await diagnostiquer(dossier, { date, politique: o.politique });
      if (o.json) await ecrireJSON(o.json, etat);
      if (o.markdown) {
        const plan = await planifier(etat).catch(() => null);
        await writeFile(o.markdown, rapportMarkdown({ etat, plan, client: { application: etat.projet.nom } }) + '\n');
      }
      console.log(resume(etat));
      const seuil = o['echec-si'];
      if (seuil && etat.actions.some((a) => a.priorite <= seuil)) process.exitCode = 2;
      break;
    }
    case 'plan': {
      const etat = await diagnostiquer(dossier, { date, politique: o.politique });
      const plan = await planifier(etat, { vers: o.vers ? Number(o.vers) : undefined });
      if (o.json) await ecrireJSON(o.json, plan);
      console.log(resumePlan(plan));
      break;
    }
    case 'sures': {
      const fiche = o.fiche ? await lireFiche(o.fiche) : null;
      const res = await appliquerSures(fiche?.depot ?? dossier, { date, pousser: o.pousser, branche: o.branche, commandes: fiche?.commandes });
      if (o.json) await ecrireJSON(o.json, res);
      console.log(res.journal.join('\n'));
      console.log(`\n${res.appliquees.length} appliquée(s), ${res.rejetees.length} écartée(s), failles ${res.auditFix.avant} → ${res.auditFix.apres}. ${res.commit ? `Commit ${res.commit} sur ${res.branche}.` : 'Aucun commit.'}`);
      if (!res.verification.ok) process.exitCode = 1;
      break;
    }
    case 'majeure': {
      if (!o.vers) throw new Error('--vers N obligatoire');
      const fiche = o.fiche ? await lireFiche(o.fiche) : null;
      const res = await appliquerMajeure(fiche?.depot ?? dossier, { vers: Number(o.vers), date, pousser: o.pousser, branche: o.branche, commandes: fiche?.commandes });
      if (o.json) await ecrireJSON(o.json, res);
      if (res.bloque) { console.log(`Bloqué :\n  ${res.bloque.join('\n  ')}`); process.exitCode = 1; break; }
      console.log(res.journal.join('\n'));
      console.log(res.commit ? `\nAngular ${res.vers} : vert, commit ${res.commit} sur ${res.branche}.` : `\nÀ reprendre à la main sur ${res.branche} (${res.echec ?? 'vérification en échec'}).`);
      if (!res.commit) process.exitCode = 1;
      break;
    }
    case 'rapport': {
      if (!o.fiche) throw new Error('--fiche <client.json> obligatoire');
      const fiche = await lireFiche(o.fiche);
      const mois = o.mois ?? date.toISOString().slice(0, 7);
      const etat = await diagnostiquer(fiche.depot, { date, politique: fiche.politique });
      const plan = await planifier(etat);
      const travaux = o.travaux ? await Promise.all(o.travaux.split(',').map(lireJSON)) : [];
      const heures = fiche.interventions ? bilan(await lireFichier(fiche.interventions), mois, fiche.palier) : null;
      const r = await ecrireRapport(o.sortie ?? path.join(fiche.suivi, mois), { etat, plan, client: fiche, travaux, heures, mois, pdf: !o['sans-pdf'] });
      console.log(Object.values(r).filter(Boolean).join('\n'));
      break;
    }
    case 'mois': {
      if (!o.fiche) throw new Error('--fiche <client.json> obligatoire');
      await routineMois(await lireFiche(o.fiche));
      break;
    }
    case 'heures': {
      const sous = reste[0];
      if (!o.fichier) throw new Error('--fichier <interventions.csv> obligatoire');
      if (sous === 'ajouter') {
        await ajouter(o.fichier, { date: o.date ?? new Date().toISOString().slice(0, 10), minutes: Number(o.minutes), type: o.type, description: o.description ?? '', ref: o.ref ?? '' });
        console.log('Intervention ajoutée.');
      } else if (sous === 'bilan') {
        if (!o.palier) throw new Error('--palier obligatoire');
        const b = bilan(await lireFichier(o.fichier), o.mois ?? new Date().toISOString().slice(0, 7), o.palier);
        console.log(`${b.mois} · palier ${b.palier} : crédit ${hm(b.creditMinutes)} (dont reliquat ${hm(b.reliquatMinutes)}), consommé ${hm(b.consommeMinutes)}, restant ${hm(b.resteMinutes)}, temps total ${hm(b.totalMinutes)}${b.facturableMinutes ? `, hors forfait ${hm(b.facturableMinutes)} = ${b.facturableHT} € HT` : ''}`);
      } else throw new Error('heures ajouter | heures bilan');
      break;
    }
    case 'portefeuille': {
      const p = await portefeuille(dossier, { date });
      console.log(portefeuilleMarkdown(p));
      if (o.json) await ecrireJSON(o.json, p);
      break;
    }
    default:
      throw new Error(`commande inconnue : ${cmd}\n\n${AIDE}`);
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
