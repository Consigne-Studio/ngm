// Semver minimal : juste ce qu'il faut pour lire les plages npm des projets Angular
// (^, ~, x, *, comparateurs, ||). Pas de dépendance, pour que l'outil tourne partout.

const RE = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parse(v) {
  const m = RE.exec(String(v).trim());
  if (!m || [m[2], m[3]].some((p) => p === 'x' || p === '*')) return null;
  return { major: +m[1], minor: +(m[2] ?? 0), patch: +(m[3] ?? 0), pre: m[4] ? m[4].split('.') : [] };
}

export function compare(a, b) {
  const x = typeof a === 'string' ? parse(a) : a;
  const y = typeof b === 'string' ? parse(b) : b;
  if (!x || !y) throw new Error(`version illisible : ${!x ? a : b}`);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const np = /^\d+$/.test(p), nq = /^\d+$/.test(q);
    if (np && nq) return +p < +q ? -1 : 1;
    if (np !== nq) return np ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

export const gt = (a, b) => compare(a, b) > 0;

/** Écart entre deux versions : 'major' | 'minor' | 'patch' | null (identiques ou b plus ancienne). */
export function ecart(de, vers) {
  const a = parse(de), b = parse(vers);
  if (!a || !b || compare(a, b) >= 0) return null;
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  return 'patch';
}

// Une plage se transforme en liste d'ensembles de comparateurs [op, version].
function partielle(s) {
  const m = /^v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?$/.exec(s);
  if (!m) return null;
  const vide = (p) => p === undefined || p === 'x' || p === '*' || p === 'X';
  return { M: vide(m[1]) ? null : +m[1], m: vide(m[2]) ? null : +m[2], p: vide(m[3]) ? null : +m[3], pre: m[4] };
}
const v = (M, m, p, pre) => ({ major: M, minor: m, patch: p, pre: pre ? pre.split('.') : [] });

function comparateurs(texte) {
  const out = [];
  const t = texte.trim().replace(/([<>=~^])\s+/g, '$1');
  if (t === '' || t === '*' || t === 'latest') return [];
  const h = /^(\S+)\s+-\s+(\S+)$/.exec(t);
  if (h) return [...comparateurs('>=' + h[1]), ...comparateurs('<=' + h[2])];
  for (const tok of t.split(/\s+/)) {
    const m = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(tok);
    const op = m[1] || '';
    const p = partielle(m[2]);
    if (!p) throw new Error(`plage illisible : ${texte}`);
    const { M, m: mi, p: pa, pre } = p;
    if (M === null) continue;
    if (op === '^') {
      const lo = v(M, mi ?? 0, pa ?? 0, pre);
      const hi = M > 0 || mi === null ? v(M + 1, 0, 0) : mi > 0 || pa === null ? v(0, mi + 1, 0) : v(0, 0, pa + 1);
      out.push(['>=', lo], ['<', hi]);
    } else if (op === '~') {
      out.push(['>=', v(M, mi ?? 0, pa ?? 0, pre)], ['<', mi === null ? v(M + 1, 0, 0) : v(M, mi + 1, 0)]);
    } else if (mi === null || pa === null) {
      // x-range : 19, 19.x, 19.2.x
      const lo = v(M, mi ?? 0, 0);
      const hi = mi === null ? v(M + 1, 0, 0) : v(M, mi + 1, 0);
      if (op === '' || op === '=') out.push(['>=', lo], ['<', hi]);
      else if (op === '>=') out.push(['>=', lo]);
      else if (op === '<') out.push(['<', lo]);
      else if (op === '>') out.push(['>=', hi]);
      else if (op === '<=') out.push(['<', hi]);
    } else out.push([op || '=', v(M, mi, pa, pre)]);
  }
  return out;
}

export function satisfies(version, plage) {
  const x = parse(version);
  if (!x) return false;
  return String(plage).split('||').some((alt) => {
    const cs = comparateurs(alt);
    // Une préversion ne satisfait une plage que si un comparateur vise la même version de base.
    if (x.pre.length && !cs.some(([, c]) => c.pre.length && c.major === x.major && c.minor === x.minor && c.patch === x.patch)) return false;
    return cs.every(([op, c]) => {
      const r = compare(x, c);
      return op === '>=' ? r >= 0 : op === '<=' ? r <= 0 : op === '>' ? r > 0 : op === '<' ? r < 0 : r === 0;
    });
  });
}

/** Plus haute version d'une liste qui satisfait la plage (préversions exclues). */
export function maxSatisfying(versions, plage) {
  let best = null;
  for (const ver of versions) {
    const p = parse(ver);
    if (!p || p.pre.length || !satisfies(ver, plage)) continue;
    if (!best || compare(ver, best) > 0) best = ver;
  }
  return best;
}

export const major = (ver) => parse(ver)?.major ?? null;
