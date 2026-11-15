# HalfSolution

Plateforme d'analyse d'opportunités SaaS. Vous décrivez une idée ; HalfSolution la décompose en tâches,
estime ce qu'un modèle IA local sait déjà en faire, calcule un score de couverture pondéré et signale
les tâches mal couvertes, c'est-à-dire les pistes de différenciation à explorer.

> Les scores sont des **estimations produites par le modèle**, pas un benchmark. Une limite technique ne
> garantit pas une opportunité commerciale : validez le besoin auprès de clients.

## Architecture

```
Navigateur ── Next.js (frontend/, :3000) ── HTTP ── FastAPI (api/, :8000) ── Python existant ── Ollama (:11434)
                                                                            core/  analysis/
```

- **`core/` et `analysis/` n'ont pas été modifiés** : le moteur d'origine est réutilisé tel quel.
- **`api/`** est la nouvelle couche REST. L'analyse s'exécute dans un thread ; le frontend interroge son état.
- **`frontend/`** est l'interface Next.js (App Router, TypeScript strict, Tailwind, Lucide, Recharts).
- **`app.py`** (Streamlit) est conservé et reste utilisable pendant la transition.

## Installation

Prérequis : Python 3.10+, Node.js 18.17+ (testé avec 22), [Ollama](https://ollama.com).

```bash
# 1. Ollama et le modèle
ollama pull qwen2.5:3b
ollama serve                       # laisser tourner

# 2. Backend (depuis la racine du projet)
python -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.main:app --port 8000   # ajouter --reload en développement

# 3. Frontend (autre terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                        # http://localhost:3000
```

Production : `npm run build && npm run start`.
Ancienne interface Streamlit (optionnelle) : `streamlit run app.py`.

## Déploiement Vercel + Render

Le dépôt contient `render.yaml` pour créer l'API FastAPI sur Render. Le frontend Next.js se déploie séparément sur Vercel. Cette configuration utilise Groq ; la clé API doit rester uniquement dans les variables d'environnement Render.

1. Sur Render, créez un **Blueprint** depuis le dépôt GitHub et validez le service `halfsolution-api` défini dans `render.yaml`.
2. Dans **Environment** du service Render, renseignez `GROQ_API_KEY` avec votre clé Groq. Après le premier déploiement, testez `https://<service>.onrender.com/api/health` et copiez l'URL du service.
3. Sur Vercel, importez le même dépôt. Réglez **Root Directory** sur `frontend` et ajoutez `NEXT_PUBLIC_API_URL=https://<service>.onrender.com`, puis déployez.
4. Copiez le domaine Vercel de production et renseignez-le comme `CORS_ORIGINS` dans Render (par exemple `https://<app>.vercel.app`). Redéployez l'API.
5. Vérifiez le frontend et `https://<service>.onrender.com/api/ollama/status` ; cette route indique aussi l'état Groq quand `LLM_ENGINE=groq`.

Ne partagez pas votre clé Groq et ne la placez jamais dans une variable `NEXT_PUBLIC_*`. L'offre gratuite Render peut mettre le service en veille ; les jobs d'analyse sont en mémoire et l'historique reste dans le navigateur.

## Variables d'environnement

Voir `.env.example` (backend : à exporter dans le shell) et `frontend/.env.example`.

| Variable | Défaut | Rôle |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Adresse d'Ollama |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modèle utilisé |
| `OLLAMA_TIMEOUT` | `180` | Délai par requête vers Ollama (s) |
| `CORS_ORIGINS` | `http://localhost:3000` | Origines autorisées |
| `EXPOSE_OLLAMA_URL` | `false` | Affiche l'adresse d'Ollama dans Paramètres |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL de l'API, côté navigateur (aucun secret) |

## API

| Route | Rôle |
|---|---|
| `GET /api/health` | Le serveur répond |
| `GET /api/config` | Modèle utilisé et seuil d'opportunité (rien de sensible) |
| `GET /api/ollama/status` | Ollama joignable ? Modèle installé ? (toujours 200, état dans le corps) |
| `POST /api/analyze` | Valide, lance l'analyse, renvoie `202 { id }` |
| `GET /api/analyze/{id}` | État du job : étapes, tâches évaluées `x / n`, résultat ou erreur |

`problem` et `value_proposition` sont obligatoires (422 sinon). Le `result` d'un job terminé suit ce contrat :

```json
{ "product": {}, "score": { "ai_coverage": 42.5, "gap": 57.5 },
  "evaluations": [{ "task": "", "weight": 5, "capability": 35, "autonomy": "faible", "limitation": "", "confidence": "moyenne" }],
  "monetization_opportunities": [{ "task": "", "reason": "" }],
  "methodology_note": "LLM-estimated; not empirically benchmarked." }
```

Erreurs normalisées (`error.code`) : `ollama_unreachable`, `model_missing`, `timeout`, `invalid_response`, `engine_error`.

**Progression réelle.** L'API appelle `evaluate_tasks()` une tâche à la fois : l'interface affiche les étapes terminées
et « tâche 2 sur 5 », sans pourcentage inventé. Les scores ne sont jamais recalculés dans le frontend.

## Seuils de couverture

Définis dans `frontend/lib/constants.ts`, alignés sur `analysis/monetization.py` :
élevée ≥ 75 % · moyenne 60–74 % · faible < 60 % (= opportunité détectée).

## Tests

```bash
pip install -r requirements-dev.txt && python -m pytest      # backend (Ollama simulé)
cd frontend && npm run typecheck && npm run lint && npm run build
```

## Arborescence

```
.
├── app.py                    Streamlit d'origine (conservé)
├── core/  analysis/          Moteur Python d'origine (inchangé)
├── api/                      FastAPI : main, jobs, schemas, errors, settings
├── tests/                    test_scoring.py (origine), test_api.py
└── frontend/
    ├── app/                  dashboard, analyze, analysis/[id], history, opportunities(/[id]), settings
    ├── components/           layout, dashboard, analysis, opportunities, charts, ui
    ├── hooks/  lib/  types/  API centralisée, stockage local, types alignés sur le backend
    └── public/
```

## Limites actuelles et suite

- **Pas de base de données ni de comptes** : l'historique est stocké dans le navigateur (`localStorage`), propre à chaque appareil. Les jobs de l'API vivent en mémoire et disparaissent au redémarrage. L'accès au stockage est isolé dans `frontend/lib/store.ts` pour être remplacé par une base.
- **Pas d'authentification** : pas de déconnexion, pas de section Compte, pas de notifications.
- **Modèle et adresse d'Ollama non modifiables depuis l'interface** (le backend les lit au démarrage).
- **Pas d'annulation** d'une analyse en cours.
- **Import de rapports** : les JSON exportés par HalfSolution ou par l'ancien Streamlit sont acceptés.
- Pistes : persistance serveur, authentification, benchmark empirique par tâche, comparaison de modèles, export PDF.

## Licence

MIT
