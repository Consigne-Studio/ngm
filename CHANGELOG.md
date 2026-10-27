# Journal des versions — consigne-ngm

## 1.0.0 — 2026-10-23

Première version.

* `diagnostic` : état de support d'Angular (table angular.dev relevée le 2026-10-23), failles `npm audit`, dépendances en retard, actions classées P1 à P4, reprise d'un `audit.json` de l'audit Angular.
* `plan` : montée de version une majeure à la fois, prérequis Node et TypeScript, bibliothèques tierces à faire suivre (PrimeNG, NgRx…), estimation, alertes bloquantes avant `ng update` : Node incompatible, npm 10 vers Angular 21 et plus, bibliothèques Angular déclarées en `devDependencies`.
* `sures` : mises à jour sans risque sur une branche dédiée, vérifiées par le lint, les tests et le build du projet ; en cas d'échec, essai paquet par paquet.
* `majeure` : exécution d'une étape du plan sur une branche dédiée, puis vérification.
* `rapport` et `mois` : rapport mensuel HTML, Markdown et PDF.
* `heures` et `portefeuille` : suivi du temps par client et tableau de bord.
* `test/e2e/reel.mjs` : essai de bout en bout reproductible (`npm run e2e`, réseau requis).
* Modèles GitHub Actions, GitLab CI et préréglage Renovate.
* Essayé de bout en bout sur une application Angular 19 réelle (Material, PrimeNG, NgRx) : routine du mois, puis montées 19 → 20 → 21, tests et build verts à chaque étape.
