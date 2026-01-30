# CRISOS

CRISOS is a crisis assistance system that combines a Rasa bot, a FastAPI
gateway, a React frontend, and a Postgres database. It supports structured
crisis flows (emergency, trapped, safe), human operator handover, location
services, and a RAG fallback that answers from official PDF sources.

## Features

- Rasa NLU and dialogue flows for emergency, trapped, and safe scenarios.
- Postgres-backed supply points, contact points, and emergency numbers.
- Admin panel for handover queue and database tables.
- Location handling with geocoding and city/address normalization.
- Weather, warnings, and evacuation checks via public APIs.
- RAG fallback from PDF sources with OpenAI or DSPy (optional).
- Voice input via OpenAI Whisper API.
- Optional translation layer (Marian OPUS models).

## Architecture

- Rasa server (NLU and dialogue)
- Action server (custom actions in `actions/actions.py`)
- Backend gateway (FastAPI in `backend/app.py`)
- Frontend (React + Tailwind in `frontend/`)
- Postgres database (schema initialized by `db/init_db.py`)

## Requirements

- Python 3.10
- Node.js 18+
- Postgres 14+

## Setup

### Python dependencies

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements_rasa.txt
pip install -r requirements_rag.txt
pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_md-3.8.0/en_core_web_md-3.8.0-py3-none-any.whl
```

### Frontend dependencies

```powershell
cd frontend
npm install
```

### Initialize the database

```powershell
python db/init_db.py
```

## Environment variables

### Database (used by backend and action server)

- `DB_HOST` (default: `localhost`)
- `DB_PORT` (default: `5432`)
- `DB_NAME` (default: `crisos_db`)
- `DB_USER` (default: `crisos_admin`)
- `DB_PASSWORD` (no default; set in your environment)

### Backend gateway

- `RASA_URL` (default: `http://localhost:5005/webhooks/rest/webhook`)
- `FRONTEND_ORIGIN` (default: `http://localhost:5173`)
- `ADMIN_PASSWORD_SALT` (default: `crisis_salt`)
- `HF_TOKEN` (optional, for Marian model downloads)
- `OPENAI_API_KEY` (optional, for Whisper and other OpenAI calls)
- `OPENAI_WHISPER_MODEL` (default: `whisper-1`)

### Action server

- `OPENAI_API_KEY` (required for RAG via OpenAI)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `ENABLE_DSPY` (default: off)
- `RAG_WARMUP` (default: true)

## Run the system

### 1) Rasa server

Use a specific model file:

```powershell
rasa run --enable-api --cors "*" --model models/<your_model>.tar.gz --endpoints endpoints.yml
```

### 2) Action server

```powershell
rasa run actions
```

### 3) Backend gateway

```powershell
python backend/app.py
```

### 4) Frontend

```powershell
cd frontend
npm run dev
```

## Docker Compose (VPS)

This brings up Postgres, Rasa, actions, backend, and frontend in one command.

```bash
docker compose up --build
```

Useful optional overrides:

- `RASA_MODEL` (default: `crisos_diet_model.tar.gz`)
- `VITE_API_BASE_URL` (default: `http://localhost:8000`)
- `FRONTEND_ORIGIN` (default: `http://localhost:5173`)

## Training

```powershell
rasa train -c .\config_diet.yml -d .\domain\
rasa train -c .\config_bert.yml -d .\domain\
```

Notes:
- Changes in `actions/actions.py` do not require retraining, only restart the action server.
- Changes in `domain/`, `data/`, or config files do require retraining.

## RAG setup

- Put PDF sources in `rag_sources/`.
- Retrieval uses FAISS and `sentence-transformers/all-MiniLM-L6-v2`.
- Current parameters (see `actions/actions.py`):
  - `RAG_RETRIEVE_K = 15`
  - `RAG_CHUNK_TOKENS = 450`
  - `RAG_CHUNK_OVERLAP_TOKENS = 80`
  - `RAG_MIN_SCORE = 0.25`
  - `RAG_REFUSE_IF_NO_EVIDENCE = True`
  - `RAG_ANSWER_FORMAT = "checklist"`

## External APIs

CRISOS connects to the following services:

- Nominatim (geocoding and reverse geocoding)
- Brightsky (current weather)
- Pegelonline (water levels)
- Open-Meteo (elevation)
- Warnung Bund (DWD and MoWaS alerts)
- NINA warnings API
- OpenAI Chat Completions (RAG answer generation)
- OpenAI Whisper (speech to text)

## Results summary (current NLU test)

Based on `results_bert/nlu/intent_report.json` and
`results_diet/nlu/intent_report.json` with the current `data/test_nlu.yml`:

| Model | Accuracy | Weighted F1 | Macro F1 |
| --- | --- | --- | --- |
| BERT | 0.9968 | 0.9967 | 0.9938 |
| DIET | 0.9903 | 0.9902 | 0.9839 |

Weak areas observed:
- BERT: `inform_building_ground`, `inform_building_mid`
- DIET: `inform_water_30_60cm`, `inform_water_above_60cm`, `inform_water_10_30cm`, `inform_fire_none`

These can be improved with more targeted examples in `data/nlu.yml` and
`data/test_nlu.yml`.

Cross-model comparison (BERT vs DIET):
- Accuracy: +0.0065
- Weighted F1: +0.0065
- Macro F1: +0.0099
