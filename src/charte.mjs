// Charte « Consigne » appliquée au rapport mensuel et à la page de vente (repère DEV-603, gamme outillage).
// Signal de la gamme : vert marche. Sens ici : la version cible, soutenue, celle vers laquelle on va.
// Une seule zone de signal par vue : la ligne de la version cible sur la frise de support.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VERSIONS } from './support.mjs';

export const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const C = {
  process: '#D4D7DA', releve: '#F3F4F5', carter: '#9AA0A6', gris: '#5C636A',
  graphite: '#1B1E21', acier: '#2A2F34', trame: 'rgba(27,30,33,.075)', signal: '#2BB673',
};

export async function polices() {
  const f = async (n) => (await readFile(path.join(RACINE, 'assets', 'fonts', n))).toString('base64');
  return `@font-face{font-family:Archivo;src:url(data:font/woff2;base64,${await f('Archivo-var.woff2')}) format('woff2');font-weight:100 900;font-stretch:62% 125%;font-display:swap}
@font-face{font-family:'Martian Mono';src:url(data:font/woff2;base64,${await f('MartianMono-var.woff2')}) format('woff2');font-weight:100 800;font-stretch:75% 112.5%;font-display:swap}
@font-face{font-family:Atkinson;src:url(data:font/woff2;base64,${await f('AtkinsonHyperlegibleNext-var.woff2')}) format('woff2');font-weight:200 800;font-display:swap}`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Bulle d'instrument ISA 5.1 : lettres en haut, numéro en bas.
export function bulle({ lettres = 'DEV', numero = '603', d = 72, alarme = false }) {
  const sw = Math.max(2, d / 40), r = d / 2 - sw / 2;
  const fond = alarme ? C.signal : C.releve;
  return `<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}" aria-hidden="true" style="display:block;flex:none">
<circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="${fond}" stroke="${C.graphite}" stroke-width="${sw}"/>
<line x1="${sw / 2}" y1="${d / 2}" x2="${d - sw / 2}" y2="${d / 2}" stroke="${C.graphite}" stroke-width="${sw}"/>
<text x="${d / 2}" y="${d * 0.4}" text-anchor="middle" font-family="Archivo" font-stretch="62%" font-weight="800" font-size="${d * 0.3}" fill="${C.graphite}">${lettres}</text>
<text x="${d / 2}" y="${d * 0.76}" text-anchor="middle" font-family="Martian Mono" font-stretch="87.5%" font-weight="500" font-size="${d * 0.2}" fill="${C.graphite}">${numero}</text></svg>`;
}

// Symbole de la maison (barre analogique + curseur de consigne), en graphite : le signal est réservé à la cible.
export function symbole(w = 56) {
  const h = w * 0.56, bh = h * 0.3, y = h - bh, cx = w * 0.5, tw = h * 0.3;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="display:block">
<rect x="0" y="${y}" width="${w}" height="${bh}" fill="${C.carter}"/><rect x="${w * 0.24}" y="${y}" width="${w * 0.46}" height="${bh}" fill="${C.graphite}"/>
<path d="M${cx - tw} 0 H${cx + tw} L${cx} ${y - h * 0.04} Z" fill="${C.graphite}"/><rect x="${cx - w * 0.018}" y="${y - h * 0.06}" width="${w * 0.036}" height="${bh + h * 0.06}" fill="${C.graphite}"/></svg>`;
}

const t = (s) => new Date(s + 'T00:00:00Z').getTime();

/**
 * Frise de support : une ligne par majeure, active en plein, support long hachuré.
 * actuelle : majeure du client (curseur « vous ») ; cible : majeure visée (seule zone de signal).
 * P : palette ; les couleurs passent par style="" pour accepter des variables CSS (thème sombre de la page de vente).
 * Autonome (n'utilise que VERSIONS et ses arguments) : la page de vente en embarque le code source.
 */
export function frise({ actuelle, cible, aujourdhui, w = 920, debutMajeure, finMajeure, P = C, versions = VERSIONS }) {
  const t = (s) => new Date(s + 'T00:00:00Z').getTime();
  const now = aujourdhui.getTime();
  const lo = debutMajeure ?? Math.max(versions[0].major, Math.min(actuelle ?? cible, cible) - 1);
  const hi = finMajeure ?? Math.min(versions[versions.length - 1].major, Math.max(cible, actuelle ?? cible) + 2);
  const lignes = versions.filter((v) => v.major >= lo && v.major <= hi);
  const x0 = Math.min(...lignes.map((v) => t(v.sortie))), x1 = Math.max(...lignes.map((v) => t(v.fin)), now);
  const gauche = 64, droite = 16, haut = 34, pas = 30, bh = 14;
  const H = haut + lignes.length * pas + 46;
  const X = (ms) => gauche + ((ms - x0) / (x1 - x0)) * (w - gauche - droite);
  const st = (fill, stroke, extra = '') => `style="fill:${fill};${stroke ? `stroke:${stroke};` : ''}${extra}"`;
  const txt = (fill = P.graphite) => `style="fill:${fill}"`;
  const out = [];
  const uid = Math.random().toString(36).slice(2, 7);
  out.push(`<defs><pattern id="lts-${uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" ${st(P.releve)}/><line x1="0" y1="0" x2="0" y2="6" style="stroke:${P.graphite};stroke-width:2.2"/></pattern>
<pattern id="ltsc-${uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" ${st(P.signal)}/><line x1="0" y1="0" x2="0" y2="6" style="stroke:${P.encreSignal ?? P.graphite};stroke-width:1.6"/></pattern></defs>`);
  const a0 = new Date(x0).getUTCFullYear(), a1 = new Date(x1).getUTCFullYear();
  for (let a = a0; a <= a1 + 1; a++) {
    const x = X(Date.UTC(a, 0, 1));
    if (x < gauche || x > w - droite) continue;
    out.push(`<line x1="${x}" y1="${haut - 8}" x2="${x}" y2="${H - 40}" style="stroke:${P.graphite};stroke-opacity:.18"/><text x="${x + 4}" y="${haut - 12}" class="f-data" font-size="10" ${txt()}>${a}</text>`);
  }
  lignes.forEach((v, i) => {
    const y = haut + i * pas;
    const estCible = v.major === cible;
    const xa = X(t(v.sortie)), xb = X(t(v.finActive)), xc = X(t(v.fin));
    out.push(`<text x="${gauche - 12}" y="${y + bh - 2}" text-anchor="end" class="f-titre" font-size="17" ${txt()}>V${v.major}</text>`);
    out.push(`<rect x="${xa}" y="${y}" width="${Math.max(1, xb - xa)}" height="${bh}" ${st(estCible ? P.signal : P.graphite)}/>`);
    out.push(`<rect x="${xb}" y="${y}" width="${Math.max(1, xc - xb)}" height="${bh}" ${st(`url(#${estCible ? 'ltsc' : 'lts'}-${uid})`, P.graphite, 'stroke-width:1')}/>`);
    if (v.estime) out.push(`<rect x="${xa}" y="${y}" width="${xc - xa}" height="${bh}" ${st(P.process, P.graphite, 'fill-opacity:.6;stroke-dasharray:3 3')}/>`);
    const etiquette = v.estime ? 'ESTIMÉ' : 'FIN ' + v.fin.slice(0, v.precision === 'mois' ? 7 : 10);
    // Pas la place à droite de la barre : l'étiquette passe à sa gauche.
    const aDroite = xc + 6 + etiquette.length * 6.4 <= w - droite;
    out.push(`<text x="${aDroite ? xc + 6 : xa - 6}" y="${y + bh - 3}"${aDroite ? '' : ' text-anchor="end"'} class="f-data" font-size="9.5" style="fill:${P.gris};stroke:${P.releve};stroke-width:4;paint-order:stroke;stroke-linejoin:round">${etiquette}</text>`);
    if (v.major === actuelle) {
      const xn = X(now);
      out.push(`<path d="M${xn - 7} ${y - 9} H${xn + 7} L${xn} ${y - 1} Z" ${st(P.graphite)}/><text x="${xn + 10}" y="${y - 2}" class="f-data" font-size="10" font-weight="600" ${txt()}>VOTRE VERSION</text>`);
    }
    if (estCible && v.major !== actuelle) out.push(`<text x="${xa + 6}" y="${y - 3}" class="f-data" font-size="10" font-weight="600" ${txt()}>CIBLE</text>`);
  });
  const xn = X(now);
  out.push(`<line x1="${xn}" y1="${haut - 8}" x2="${xn}" y2="${H - 36}" style="stroke:${P.graphite};stroke-width:1.5;stroke-dasharray:4 3"/>`);
  out.push(`<text x="${Math.max(gauche, Math.min(xn, w - droite - 80))}" y="${H - 24}" text-anchor="middle" class="f-data" font-size="10" font-weight="600" ${txt()}>AUJOURD'HUI ${aujourdhui.toISOString().slice(0, 10)}</text>`);
  out.push(`<g transform="translate(${gauche},${H - 9})" class="f-data" font-size="9.5"><rect width="18" height="8" ${st(P.graphite)}/><text x="24" y="8" ${txt()}>ACTIVE</text><rect x="86" width="18" height="8" ${st(`url(#lts-${uid})`, P.graphite)}/><text x="110" y="8" ${txt()}>SUPPORT LONG</text></g>`);
  return `<svg class="frise" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Fenêtres de support des versions d'Angular ${lo} à ${hi}">${out.join('')}</svg>`;
}

export const CSS_BASE = `*{box-sizing:border-box;margin:0;padding:0}
:root{--process:${C.process};--releve:${C.releve};--carter:${C.carter};--gris:${C.gris};--graphite:${C.graphite};--acier:${C.acier};--signal:${C.signal};--trame:${C.trame}}
body{font-family:Atkinson,system-ui,sans-serif;color:var(--graphite);background:var(--process);-webkit-font-smoothing:antialiased;line-height:1.45}
.f-titre,.titre{font-family:Archivo,'Arial Narrow',sans-serif;font-weight:800;font-stretch:62%;text-transform:uppercase;line-height:.88}
.f-data,.data{font-family:'Martian Mono',ui-monospace,monospace;font-stretch:87.5%;font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-variant-numeric:tabular-nums}
svg text.f-data{fill:currentColor}
.planche{background-color:var(--process);background-image:linear-gradient(var(--trame) 1px,transparent 1px),linear-gradient(90deg,var(--trame) 1px,transparent 1px);background-size:16px 16px}
a{color:inherit;text-underline-offset:2px}`;
