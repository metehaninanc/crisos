# Local Development

## Backend gateway (Python)
1) Create a venv and install dependencies:
```
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

2) Run the gateway:
```
python backend/app.py
```

Environment variables (optional):
- `RASA_URL` (default: `http://localhost:5005/webhooks/rest/webhook`)
- `FRONTEND_ORIGIN` (default: `http://localhost:5173`)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (for handoff DB access)

## Rasa services
```
rasa run --enable-api --cors "*"
rasa run actions
```

## Frontend (React)
```
cd frontend
npm install
npm run dev
```

Environment variables (optional):
- `VITE_API_BASE_URL` (default: `http://localhost:8000`)

Admin console:
- Use the "Operator Console" tab to view handovers and chat with users.
- Default admin login: `crisos_admin` / `123456789`
- Set `ADMIN_PASSWORD_SALT` in both backend and `db/init_db.py` if you change hashing.
