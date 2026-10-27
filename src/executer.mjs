// Lancement de commandes externes (npm, git, ng). Toutes les fonctions de l'outil passent par ici,
// ce qui permet aux tests de remplacer le vrai npm par des réponses enregistrées.
import { spawn } from 'node:child_process';

let remplacant = null;

/** Pour les tests : (cmd, args, opts) => { code, stdout, stderr } | Promise. null rétablit le vrai lanceur. */
export function remplacerLanceur(fn) {
  remplacant = fn;
}

export function executer(cmd, args = [], { cwd, env, entree, delaiMs = 15 * 60_000 } = {}) {
  if (remplacant) return Promise.resolve(remplacant(cmd, args, { cwd, env }));
  return new Promise((resolve) => {
    // npm, npx et ng sont des .cmd sous Windows : il faut le shell. Les arguments ne viennent jamais du réseau.
    const enfant = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: process.platform === 'win32' });
    let stdout = '', stderr = '';
    const minuteur = setTimeout(() => enfant.kill('SIGTERM'), delaiMs);
    enfant.stdout.on('data', (b) => (stdout += b));
    enfant.stderr.on('data', (b) => (stderr += b));
    if (entree) enfant.stdin.end(entree);
    enfant.on('error', (e) => { clearTimeout(minuteur); resolve({ code: 127, stdout, stderr: stderr + e.message }); });
    enfant.on('close', (code) => { clearTimeout(minuteur); resolve({ code: code ?? 1, stdout, stderr }); });
  });
}

/** Commande de shell complète (scripts du client, ex. « npm run test -- --watch=false »). */
export function executerLigne(ligne, { cwd, env, delaiMs } = {}) {
  if (remplacant) return Promise.resolve(remplacant('sh', ['-c', ligne], { cwd, env }));
  return new Promise((resolve) => {
    const enfant = spawn(ligne, { cwd, env: { ...process.env, CI: '1', ...env }, shell: true });
    let sortie = '';
    const minuteur = setTimeout(() => enfant.kill('SIGTERM'), delaiMs ?? 30 * 60_000);
    enfant.stdout.on('data', (b) => (sortie += b));
    enfant.stderr.on('data', (b) => (sortie += b));
    enfant.on('close', (code) => { clearTimeout(minuteur); resolve({ code: code ?? 1, stdout: sortie, stderr: '' }); });
  });
}

/** Lit la sortie JSON d'une commande npm, même quand le code de retour est non nul (npm outdated renvoie 1). */
export function jsonDe(res, defaut = {}) {
  const t = res.stdout.trim();
  if (!t) return defaut;
  try {
    return JSON.parse(t);
  } catch {
    // npm peut préfixer des avertissements : on garde le premier bloc JSON.
    const i = t.search(/[[{]/);
    if (i >= 0) try { return JSON.parse(t.slice(i)); } catch { /* sortie illisible */ }
    throw new Error(`sortie JSON illisible : ${t.slice(0, 200)}`);
  }
}
