// Tableau de bord d'Antoine : tous les clients d'un dossier (fiches *.client.json), sans appel réseau.
// Lit le dernier etat.json de chaque client et le relevé d'heures, et liste ce qui demande une action.
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { palier, euros } from './offre.mjs';
import { statut, iso } from './support.mjs';
import { lireFichier, bilan, hm } from './heures.mjs';

async function fiches(dossier) {
  const out = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isFile() && e.name.endsWith('.client.json')) out.push(p);
    else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      for (const f of await readdir(p)) if (f.endsWith('.client.json')) out.push(path.join(p, f));
    }
  }
  return out.sort();
}

async function dernierEtat(suivi) {
  try { await access(suivi); } catch { return null; }
  const mois = (await readdir(suivi)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  for (const m of mois) {
    try { return { mois: m, etat: JSON.parse(await readFile(path.join(suivi, m, 'etat.json'), 'utf8')) }; } catch { /* mois incomplet */ }
  }
  return null;
}

export async function portefeuille(dossier, { date = new Date() } = {}) {
  const mois = iso(date).slice(0, 7);
  const clients = [];
  for (const f of await fiches(dossier)) {
    const fiche = JSON.parse(await readFile(f, 'utf8'));
    const base = path.dirname(f);
    const p = palier(fiche.palier);
    const d = await dernierEtat(path.resolve(base, fiche.suivi ?? 'suivi'));
    const major = d?.etat?.projet?.angular?.major ?? null;
    const s = major ? statut(major, date) : null;
    const h = fiche.interventions ? bilan(await lireFichier(path.resolve(base, fiche.interventions)), mois, fiche.palier) : null;
    const alertes = [];
    if (!d) alertes.push('aucun diagnostic enregistré');
    else if (d.mois !== mois) alertes.push(`rapport de ${mois} à faire (dernier : ${d.mois})`);
    if (s?.etat === 'fin') alertes.push(`Angular ${major} hors support`);
    else if (s && s.joursRestants <= 90) alertes.push(`Angular ${major} : fin du support dans ${s.joursRestants} j`);
    if (d?.etat?.actions?.some((a) => a.priorite === 'P1')) alertes.push('action P1 ouverte');
    if (h && h.creditMinutes && h.resteMinutes / h.creditMinutes < 0.25) alertes.push(`heures presque épuisées (reste ${hm(h.resteMinutes)})`);
    if (h?.depassementMinutes) alertes.push(`dépassement ${hm(h.depassementMinutes)} à faire valider`);
    clients.push({ fiche: f, client: fiche.client, application: fiche.application, cle: p.cle, palier: p.nom, prixHT: p.prixHT * (fiche.multiplicateur ?? 1), angular: d?.etat?.projet?.angular?.version ?? null, support: s, heures: h, alertes });
  }
  const mensuelHT = clients.reduce((a, c) => a + c.prixHT, 0);
  return { date: iso(date), mois, clients, mensuelHT, annuelHT: mensuelHT * 12, heuresIncluses: clients.reduce((a, c) => a + palier(c.cle).heures, 0) };
}

export function portefeuilleMarkdown(p) {
  const l = [`# Portefeuille maintenance Angular · ${p.date}`, '', `${p.clients.length} client(s) · ${euros(p.mensuelHT)} HT par mois · ${euros(p.annuelHT)} HT par an · ${p.heuresIncluses} h de correctifs incluses par mois`, ''];
  l.push('| Client | Application | Palier | Angular | Support | Heures du mois | À faire |', '|---|---|---|---|---|---|---|');
  for (const c of p.clients) {
    const sup = c.support ? (c.support.etat === 'fin' ? 'hors support' : `${c.support.joursRestants} j`) : '—';
    const h = c.heures ? `${hm(c.heures.consommeMinutes)} / ${hm(c.heures.creditMinutes)}` : '—';
    l.push(`| ${c.client} | ${c.application} | ${c.palier} | ${c.angular ?? '—'} | ${sup} | ${h} | ${c.alertes.join(' ; ') || 'rien'} |`);
  }
  return l.join('\n');
}
