// Rapport mensuel du client : une planche HTML autonome (polices incluses, imprimable en A4) et un résumé Markdown
// pour la demande de fusion ou l'e-mail. Contenu réel uniquement : tout vient de l'état, du plan et des heures.
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { C, CSS_BASE, polices, esc, bulle, symbole, frise } from './charte.mjs';
import { GRAVITE_FR } from './diagnostic.mjs';
import { palier, CONDITIONS, euros } from './offre.mjs';
import { hm } from './heures.mjs';
import { executer } from './executer.mjs';

const ETAT_FR = { active: 'Support actif', lts: 'Support long (correctifs critiques)', fin: 'Hors support', inconnue: 'Inconnu' };
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const moisLong = (m) => { const [a, mo] = m.split('-').map(Number); return `${MOIS_FR[mo - 1]} ${a}`; };

function chiffreSupport(s) {
  if (!s) return ['—', 'version introuvable'];
  if (s.etat === 'fin') return [`${-s.joursRestants} j`, `hors support depuis le ${s.fin}`];
  return [`${s.joursRestants} j`, `avant la fin du support (${s.precision === 'mois' ? s.fin.slice(0, 7) : s.fin})`];
}

/**
 * @param d.etat      diagnostiquer()
 * @param d.plan      planifier() (facultatif)
 * @param d.client    { client, application, palier, contact? }
 * @param d.travaux   résultat de appliquerSures / appliquerMajeure (facultatif, liste)
 * @param d.heures    bilan() du mois (facultatif)
 * @param d.mois      'AAAA-MM'
 */
export async function rapportHTML(d) {
  const { etat, plan, client, heures } = d;
  const travaux = d.travaux ?? [];
  const mois = d.mois ?? etat.date.slice(0, 7);
  const p = palier(client.palier);
  const s = etat.support;
  const [cs, ls] = chiffreSupport(s);
  const v = etat.vulnerabilites;
  const ind = etat.indicateurs;
  const date = new Date(etat.date + 'T12:00:00Z');

  const prio = (x) => `<span class="prio prio-${x.toLowerCase()}">${x}</span>`;
  const actions = etat.actions.map((a) => `<tr><td>${prio(a.priorite)}</td><td><strong>${esc(a.titre)}</strong>${a.detail ? `<div class="detail">${esc(a.detail)}</div>` : ''}</td></tr>`).join('');

  const lignesTravaux = [];
  for (const t of travaux) {
    if (t.mode === 'sures') {
      for (const a of t.appliquees ?? []) lignesTravaux.push([`${a.name}`, `${a.de} → ${a.vers}`, 'appliquée']);
      for (const r of t.rejetees ?? []) lignesTravaux.push([`${r.name}`, `${r.de} → ${r.vers}`, `écartée : ${r.raison?.etape ?? 'vérification'} en échec`]);
      if (t.auditFix && t.auditFix.apres < t.auditFix.avant) lignesTravaux.push(['npm audit fix', `${t.auditFix.avant} → ${t.auditFix.apres} failles`, 'appliqué']);
      if (t.auditFix?.annule) lignesTravaux.push(['npm audit fix', 'annulé', 'cassait la vérification']);
      if (t.commit) lignesTravaux.push([`Branche ${t.branche}`, `commit ${t.commit}`, (t.verification?.resultats ?? []).filter((x) => x.statut === 'ok').map((x) => x.etape).join(' · ') + ' : vert']);
    } else if (t.mode === 'majeure') {
      lignesTravaux.push([`Angular ${t.vers}`, t.branche ?? '', t.commit ? `montée faite, commit ${t.commit}` : t.bloque ? `bloquée : ${t.bloque.join(' ; ')}` : `en cours : ${t.echec ?? 'vérification'} à reprendre`]);
    }
  }
  for (const i of heures?.interventions ?? []) {
    if (i.type !== 'routine') lignesTravaux.push([i.description || i.type, `${i.date} · ${hm(i.minutes)}`, i.type + (i.ref ? ` · ${i.ref}` : '')]);
  }

  const failles = v.avis.slice(0, 14).map((a) => `<tr><td><span class="grav grav-${a.gravite}">${GRAVITE_FR[a.gravite] ?? a.gravite}</span></td><td>${esc(a.paquet)}</td><td>${a.url ? `<a href="${esc(a.url)}">${esc(a.titre)}</a>` : esc(a.titre)}</td><td class="f-data">${esc(a.plage ?? '')}</td></tr>`).join('');
  const deps = etat.dependances.filter((x) => !x.dev).concat(etat.dependances.filter((x) => x.dev))
    .map((x) => `<tr${x.retard === 'major' ? ' class="retard"' : ''}><td>${esc(x.name)}${x.dev ? ' <span class="dev">dev</span>' : ''}</td><td class="f-data">${esc(x.version)}</td><td class="f-data">${esc(x.derniere)}</td><td>${x.retard ? { major: 'majeure', minor: 'mineure', patch: 'correctif' }[x.retard] : 'à jour'}</td></tr>`).join('');

  const etapes = plan?.etapes?.length
    ? plan.etapes.map((e) => `<div class="etape"><div class="etape-tete"><span class="f-titre">→ V${e.vers}</span><span class="f-data">${e.prerequis ? `NODE ${esc(e.prerequis.node)} · TS ${esc(e.prerequis.ts)}` : ''}</span><span class="f-data">≈ ${e.heures} H</span></div>
      <ul>${e.bibliotheques.map((b) => `<li>${esc(b.name)} ${esc(b.actuelle)} → ${esc(b.conseillee ?? 'aucune version compatible')}</li>`).join('')}${e.notes.map((n) => `<li>${esc(n).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`).join('')}${e.alertes.map((n) => `<li><strong>${esc(n)}</strong></li>`).join('')}</ul></div>`).join('')
    : `<p>${esc(plan?.message ?? 'Pas de montée de version majeure à prévoir.')}</p>`;

  const hBloc = heures
    ? `<div class="kv"><div><span class="f-data">Crédit du mois</span><b>${hm(heures.creditMinutes)}</b><i>${heures.reliquatMinutes ? `dont ${hm(heures.reliquatMinutes)} reportées` : `forfait ${p.nom}`}</i></div>
       <div><span class="f-data">Consommé</span><b>${hm(heures.consommeMinutes)}</b><i>correctifs et évolutions</i></div>
       <div><span class="f-data">Restant</span><b>${hm(heures.resteMinutes)}</b><i>reportable ${CONDITIONS.reportHeuresMois} mois</i></div>
       <div><span class="f-data">Temps total passé</span><b>${hm(heures.totalMinutes)}</b><i>routine et montées comprises</i></div></div>
       ${heures.facturableMinutes ? `<p class="note">Hors forfait ce mois : ${hm(heures.facturableMinutes)}, soit ${euros(heures.facturableHT)} HT au taux de ${CONDITIONS.heureSupHT} € HT/h (devis accepté).</p>` : '<p class="note">Aucun dépassement ce mois.</p>'}`
    : '<p class="note">Pas de relevé d’heures fourni pour ce mois.</p>';

  const css = `${await polices()}${CSS_BASE}
body{padding:24px}
.feuille{max-width:1000px;margin:0 auto;background:var(--releve);border:1.5px solid var(--graphite);position:relative}
.tete{display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:center;padding:22px 26px;border-bottom:1.5px solid var(--graphite)}
.tete h1{font-size:46px}
.tete .sous{font-size:15px;color:var(--gris);margin-top:6px}
.cartouche{border:1px solid var(--graphite);display:grid;grid-template-columns:repeat(2,auto);font-size:10px}
.cartouche div{padding:4px 8px;border-top:1px solid var(--graphite)}
.cartouche div:nth-child(-n+2){border-top:0}
.cartouche div:nth-child(even){border-left:1px solid var(--graphite)}
.cartouche span{display:block;font-size:8px;opacity:.62}
section{padding:20px 26px;border-bottom:1px solid var(--graphite)}
section:last-of-type{border-bottom:0}
h2{font-size:24px;margin-bottom:12px;display:flex;gap:12px;align-items:baseline}
h2 .f-data{font-size:10px;font-family:'Martian Mono';font-weight:500;color:var(--gris)}
.synthese{display:grid;grid-template-columns:repeat(4,1fr);border-top:1.5px solid var(--graphite);border-bottom:1.5px solid var(--graphite)}
.synthese div{padding:12px 0 12px 14px}
.synthese div+div{border-left:1px solid var(--graphite)}
.synthese b{display:block;font-family:Archivo;font-weight:800;font-stretch:62%;font-size:44px;line-height:1}
.synthese i{display:block;font-style:normal;font-size:12.5px;color:var(--gris);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{font-family:'Martian Mono';font-stretch:87.5%;text-transform:uppercase;letter-spacing:.06em;font-size:9.5px;text-align:left;padding:5px 8px;border-bottom:1.5px solid var(--graphite);font-weight:500}
td{padding:6px 8px;border-bottom:1px solid rgba(27,30,33,.18);vertical-align:top}
td.f-data{font-size:11px}
.detail{color:var(--gris);font-size:12px;margin-top:2px}
.prio{font-family:'Martian Mono';font-stretch:87.5%;font-size:10.5px;font-weight:600;display:inline-block;min-width:30px;text-align:center;padding:1px 4px;border:1.5px solid var(--graphite)}
.prio-p1{background:var(--graphite);color:var(--releve)}
.prio-p2{border-width:2.5px}
.prio-p4{border-style:dashed}
.grav{font-family:'Martian Mono';font-stretch:87.5%;font-size:10px;text-transform:uppercase}
.grav-critical,.grav-high{font-weight:700}
tr.retard td:first-child{font-weight:600}
.dev{font-family:'Martian Mono';font-size:9px;color:var(--gris);border:1px solid var(--carter);padding:0 3px}
.etape{border:1px solid var(--graphite);margin-bottom:10px}
.etape-tete{display:flex;gap:16px;align-items:baseline;padding:6px 10px;border-bottom:1px solid var(--graphite);background:var(--process)}
.etape-tete .f-titre{font-size:20px}.etape-tete .f-data{font-size:10px}
.etape ul{padding:8px 10px 8px 28px;font-size:13px}
code{font-family:'Martian Mono';font-size:.86em;background:var(--process);padding:0 3px}
.kv{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--graphite)}
.kv div{padding:10px 12px}.kv div+div{border-left:1px solid var(--graphite)}
.kv .f-data{font-size:9.5px;display:block}.kv b{display:block;font-family:Archivo;font-stretch:62%;font-size:30px;margin-top:4px}.kv i{font-style:normal;font-size:12px;color:var(--gris)}
.note{font-size:13px;color:var(--gris);margin-top:8px}
.bandeau{padding:8px 26px;font-size:10.5px;border-bottom:1.5px solid var(--graphite);background:repeating-linear-gradient(45deg,var(--process) 0 6px,var(--releve) 6px 12px)}
.pied{display:flex;justify-content:space-between;gap:16px;padding:12px 26px;font-size:9.5px;color:var(--gris);border-top:1.5px solid var(--graphite)}
.deux{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media (max-width:760px){.synthese,.kv{grid-template-columns:1fr 1fr}.tete{grid-template-columns:auto 1fr}.cartouche{grid-column:1/-1}.deux{grid-template-columns:1fr}}
@media print{body{padding:0;background:#fff}.feuille{border:0;max-width:none}section{break-inside:avoid-page}@page{size:A4;margin:12mm}}`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance Angular · ${esc(client.application)} · ${moisLong(mois)}</title><style>${css}</style></head>
<body class="planche"><main class="feuille">${d.bandeau ? `<div class="bandeau f-data">${esc(d.bandeau)}</div>` : ''}
<header class="tete">${bulle({ d: 76 })}
<div><h1 class="f-titre">Rapport de maintenance</h1><p class="sous">${esc(client.application)} · ${esc(client.client)} · ${moisLong(mois)}</p></div>
<div class="cartouche f-data"><div><span>Palier</span>${esc(p.nom)}</div><div><span>Date</span>${etat.date}</div>
<div><span>Angular</span>${esc(etat.projet.angular?.version ?? '—')}</div><div><span>Repère</span>DEV-603</div></div></header>

<section><h2 class="f-titre">Synthèse <span class="f-data">au ${etat.date}</span></h2>
<div class="synthese">
<div><span class="f-data">Angular</span><b>${etat.projet.angular ? 'V' + etat.projet.angular.major : '—'}</b><i>${esc(ETAT_FR[s?.etat] ?? '—')}</i></div>
<div><span class="f-data">Support</span><b>${cs}</b><i>${esc(ls)}</i></div>
<div><span class="f-data">Failles graves</span><b>${ind.faillesGraves}</b><i>${v.critical} critique(s), ${v.high} haute(s) sur ${v.total}</i></div>
<div><span class="f-data">Dépendances</span><b>${ind.santeDependances} %</b><i>sans retard majeur (${ind.dependances - ind.retardMajeur}/${ind.dependances})</i></div>
</div></section>

<section><h2 class="f-titre">Fenêtres de support <span class="f-data">source angular.dev, relevé du ${etat.releveSupport}</span></h2>
${frise({ actuelle: etat.projet.angular?.major, cible: plan?.vers ?? etat.cible, aujourdhui: date })}</section>

<section><h2 class="f-titre">À traiter <span class="f-data">P1 urgent · P4 confort</span></h2>
<table><thead><tr><th style="width:60px">Priorité</th><th>Constat</th></tr></thead><tbody>${actions || '<tr><td colspan="2">Rien à signaler.</td></tr>'}</tbody></table></section>

<section><h2 class="f-titre">Travaux du mois</h2>
${lignesTravaux.length ? `<table><thead><tr><th>Objet</th><th>Détail</th><th>Résultat</th></tr></thead><tbody>${lignesTravaux.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="note">Aucun travail enregistré pour ce mois.</p>'}</section>

<section><h2 class="f-titre">Heures</h2>${hBloc}</section>

<section><h2 class="f-titre">Montée de version <span class="f-data">${plan?.etapes?.length ? `V${plan.de} VERS V${plan.vers} · ≈ ${plan.heures} h · ${esc(plan.guide)}` : ''}</span></h2>${etapes}
${plan?.bloquants?.length ? `<p class="note"><strong>Bloquants :</strong> ${plan.bloquants.map(esc).join(' ; ')}</p>` : ''}</section>

<section><h2 class="f-titre">Failles connues <span class="f-data">npm audit · ${v.avis.length} avis distincts${v.avis.length > 14 ? ', 14 premiers' : ''}</span></h2>
${failles ? `<table><thead><tr><th>Gravité</th><th>Paquet</th><th>Avis</th><th>Versions touchées</th></tr></thead><tbody>${failles}</tbody></table>` : '<p class="note">Aucune faille connue.</p>'}</section>

<section><h2 class="f-titre">Dépendances directes <span class="f-data">${ind.dependances} paquets</span></h2>
<table><thead><tr><th>Paquet</th><th>Installée</th><th>Dernière</th><th>Retard</th></tr></thead><tbody>${deps}</tbody></table></section>

<footer class="pied f-data"><span style="display:flex;gap:10px;align-items:center">${symbole(34)} Consigne · maintenance Angular</span><span>${esc(etat.outil.nom)} ${esc(etat.outil.version)} · généré le ${etat.date}</span></footer>
</main></body></html>`;
}

export function rapportMarkdown({ etat, plan, client, travaux = [], heures, mois }) {
  const m = mois ?? etat.date.slice(0, 7);
  const s = etat.support;
  const l = [];
  l.push(`## Maintenance Angular · ${client.application} · ${moisLong(m)}`, '');
  l.push(`| Angular | Support | Failles graves | Dépendances sans retard majeur |`, '|---|---|---|---|');
  l.push(`| ${etat.projet.angular?.version ?? '—'} | ${ETAT_FR[s?.etat] ?? '—'}${s?.fin ? ` (fin ${s.fin})` : ''} | ${etat.indicateurs.faillesGraves} / ${etat.vulnerabilites.total} | ${etat.indicateurs.santeDependances} % |`, '');
  if (etat.actions.length) {
    l.push('### À traiter', '');
    for (const a of etat.actions) l.push(`- **${a.priorite}** ${a.titre}${a.detail ? ` : ${a.detail}` : ''}`);
    l.push('');
  }
  const t = travaux.find((x) => x.mode === 'sures');
  if (t) {
    l.push('### Mises à jour de ce mois', '');
    for (const a of t.appliquees) l.push(`- ${a.name} ${a.de} → ${a.vers}`);
    for (const r of t.rejetees) l.push(`- ~~${r.name} ${r.de} → ${r.vers}~~ écartée (${r.raison?.etape ?? 'vérification'} en échec)`);
    if (t.auditFix && t.auditFix.apres < t.auditFix.avant) l.push(`- npm audit fix : ${t.auditFix.avant} → ${t.auditFix.apres} failles`);
    if (!t.appliquees.length && !(t.auditFix?.apres < t.auditFix?.avant)) l.push('- aucune mise à jour sûre disponible');
    l.push('', `Vérifié : ${(t.verification?.resultats ?? []).map((x) => `${x.etape} ${x.statut}`).join(', ')}.`, '');
  }
  if (plan?.etapes?.length) l.push(`### Montée de version`, '', `Angular ${plan.de} → ${plan.vers} en ${plan.etapes.length} étape(s), ≈ ${plan.heures} h. Guide : ${plan.guide}`, '');
  if (heures) l.push(`### Heures`, '', `Crédit ${hm(heures.creditMinutes)}, consommé ${hm(heures.consommeMinutes)}, restant ${hm(heures.resteMinutes)}.`, '');
  l.push(`_Rapport généré par ${etat.outil.nom} ${etat.outil.version} le ${etat.date}._`);
  return l.join('\n');
}

const CHROMES = [process.env.CHROME_BIN, process.env.PW_CHROMIUM, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);

/** PDF A4 via Chrome/Chromium sans tête, s'il est installé. Renvoie le chemin, ou null. */
export async function versPDF(fichierHTML, fichierPDF) {
  for (const c of CHROMES) {
    try { await access(c); } catch { continue; }
    const r = await executer(c, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${fichierPDF}`, 'file://' + path.resolve(fichierHTML)]);
    if (r.code === 0) return fichierPDF;
  }
  return null;
}

export async function ecrireRapport(dossierSortie, donnees) {
  const mois = donnees.mois ?? donnees.etat.date.slice(0, 7);
  const base = path.join(dossierSortie, `rapport-${mois}`);
  await writeFile(base + '.html', await rapportHTML(donnees));
  await writeFile(base + '.md', rapportMarkdown(donnees));
  const pdf = donnees.pdf === false ? null : await versPDF(base + '.html', base + '.pdf');
  return { html: base + '.html', md: base + '.md', pdf };
}
