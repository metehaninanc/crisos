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

## Environment variables

- `RASA_URL` (default: `http://localhost:5005/webhooks/rest/webhook`)
- `FRONTEND_ORIGIN` (default: `http://localhost:5173`)
- `ADMIN_PASSWORD_SALT` (default: `crisis_salt`)
- `HF_TOKEN` (optional, for Marian model downloads)
- `OPENAI_API_KEY` (optional, for Whisper and other OpenAI calls)
- `OPENAI_WHISPER_MODEL` (default: `whisper-1`)

### Action server

- `OPENAI_API_KEY` (required for RAG via OpenAI)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `ENABLE_DSPY` (default: true)
- `RAG_WARMUP` (default: true)

## Run the system

## Docker Compose

```bash
docker compose up --build
```

## Training

```powershell
rasa train --config .\config_diet.yml -d .\domain\ --fixed-model-name crisos_diet_model
rasa train --config .\config_bert.yml -d .\domain\ --fixed-model-name crisos_bert_model
```

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

## Results summary (NLU intent report)

| Run | Accuracy | Macro F1 | Weighted F1 | Support |
| --- | --- | --- | --- | --- |
| BERT (test) | 0.7526 | 0.7347 | 0.7388 | 380 |
| BERT (cross) | 0.7930 | 0.7826 | 0.7925 | 995 |
| DIET (test) | 0.7447 | 0.7404 | 0.7378 | 380 |
| DIET (cross) | 0.7668 | 0.7560 | 0.7649 | 995 |
