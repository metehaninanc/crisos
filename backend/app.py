import hashlib
import os
import re
import secrets
import time
import sys
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException, Query, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from transformers import MarianMTModel, MarianTokenizer
except Exception:  
    MarianMTModel = None
    MarianTokenizer = None
from psycopg2 import sql

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from db.connection import get_connection
from db import init_db as db_init

RASA_URL = os.getenv("RASA_URL", "http://localhost:5005/webhooks/rest/webhook")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
ADMIN_PASSWORD_SALT = os.getenv("ADMIN_PASSWORD_SALT", "crisis_salt")
TOKEN_STORE = {}

TRANSLATION_MODELS = {
    ("tr", "en"): "Helsinki-NLP/opus-mt-tr-en",
    ("en", "tr"): "Helsinki-NLP/opus-mt-tc-big-en-tr",
    ("de", "en"): "Helsinki-NLP/opus-mt-de-en",
    ("en", "de"): "Helsinki-NLP/opus-mt-en-de",
}
TRANSLATION_CACHE = {}
TRANSLATOR_CACHE = {}
TRANSLATION_CACHE_LIMIT = 1000
BUND_ALERT_SOURCES = {
    "dwd": "https://warnung.bund.de/api31/dwd/mapData.json",
    "mowas": "https://warnung.bund.de/api31/mowas/mapData.json",
}
ALERT_SEVERITY_LEVELS = {"severe", "extreme"}

ADMIN_TABLES = {
    "users",
    "supply_points",
    "contact_points",
    "emergency_numbers",
    "handoff_requests",
    "handoff_messages",
}
OPERATOR_TABLES = {
    "supply_points",
    "contact_points",
}

app = FastAPI(title="CRISOS Local Gateway", version="0.1.0")


# Runs the DB initializer during app startup.
@app.on_event("startup")
def init_db_on_startup() -> None:
    try:
        db_init.main()
    except Exception as exc:
        print(f"[DB] Init failed: {exc}")
        raise


# Loads translation models into cache on startup.
@app.on_event("startup")
def warmup_translators() -> None:
    for model_name in TRANSLATION_MODELS.values():
        _get_translator(model_name)


# Sends a dummy message to warm up the Rasa model and reduce first-request delay.
@app.on_event("startup")
def warmup_rasa() -> None:
    try:
        requests.post(
            RASA_URL,
            json={"sender": "warmup", "message": "hello"},
            timeout=10,
        )
    except Exception as exc:
        print(f"[Rasa] Warm-up skipped: {exc}")


# Normalizes a locale string and returns the short code.
def _normalize_locale(locale: Optional[str]) -> str:
    if not locale:
        return "en"
    return locale.split("-")[0].lower()


# Checks if text looks like coordinates and returns True/False.
def _looks_like_coords(text: str) -> bool:
    return bool(
        re.match(r"^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$", text)
    )


# Checks if text looks like an address and returns True/False.
def _looks_like_address(text: str) -> bool:
    lowered = text.lower()
    if re.search(r"\d{2,}", text) and "," in text:
        return True
    address_tokens = [
        "strasse",
        "street",
        "road",
        "rd",
        "avenue",
        "ave",
        "platz",
        "plz",
        "str.",
    ]
    return any(token in lowered for token in address_tokens)


# Decides if inbound text should be translated and returns True/False.
def _should_translate_inbound(text: str) -> bool:
    if not text:
        return False
    stripped = text.strip()
    if stripped.startswith("/"):
        return False
    if stripped.startswith("{") or stripped.startswith("["):
        return False
    if _looks_like_coords(text) or _looks_like_address(text):
        return False
    return True


# Decides if outbound text should be translated and returns True/False.
def _should_translate_outbound(text: str) -> bool:
    if not text:
        return False
    stripped = text.strip()
    if stripped.startswith("/"):
        return False
    if "http://" in text or "https://" in text:
        return False
    if _looks_like_coords(text):
        return False
    return True


# Loads or returns a cached Marian translator and returns it or None.
def _get_translator(model_name: str):
    if MarianTokenizer is None or MarianMTModel is None:
        return None
    if model_name in TRANSLATOR_CACHE:
        return TRANSLATOR_CACHE[model_name]
    token = os.getenv("HF_TOKEN")
    try:
        tokenizer = MarianTokenizer.from_pretrained(model_name, token=token)
        model = MarianMTModel.from_pretrained(model_name, token=token)
        model.eval()
        TRANSLATOR_CACHE[model_name] = (tokenizer, model)
        return TRANSLATOR_CACHE[model_name]
    except Exception as exc:
        print(f"[Translation] Failed to load {model_name}: {exc}")
        TRANSLATOR_CACHE[model_name] = None
        return None


# Stores a translation result in the in-memory cache.
def _cache_translation(key, value):
    if len(TRANSLATION_CACHE) >= TRANSLATION_CACHE_LIMIT:
        TRANSLATION_CACHE.clear()
    TRANSLATION_CACHE[key] = value


# Translates a single text and returns the translated string.
def _translate_text(text: str, source_lang: str, target_lang: str) -> str:
    if not text or source_lang == target_lang:
        return text
    model_name = TRANSLATION_MODELS.get((source_lang, target_lang))
    if not model_name:
        return text
    key = (model_name, text)
    cached = TRANSLATION_CACHE.get(key)
    if cached:
        return cached
    translator = _get_translator(model_name)
    if not translator:
        return text
    tokenizer, model = translator
    try:
        batch = tokenizer([text], return_tensors="pt", truncation=True)
        generated = model.generate(**batch, max_length=512)
        decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
        result = decoded[0] if decoded else text
        _cache_translation(key, result)
        return result
    except Exception:
        return text


# Calls OpenAI Whisper and returns the transcript text.
def _transcribe_with_openai(audio_bytes: bytes, filename: str, language: Optional[str]) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set.")
    model = os.getenv("OPENAI_WHISPER_MODEL", "whisper-1")
    files = {
        "file": (filename or "audio.webm", audio_bytes),
    }
    data = {
        "model": model,
        "response_format": "json",
    }
    if language in {"en", "de", "tr"}:
        data["language"] = language
    try:
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files=files,
            data=data,
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    payload = response.json()
    text = (payload.get("text") or "").strip()
    return text


# Translates outgoing messages and returns the updated list.
def _translate_messages(messages, target_lang: str):
    if target_lang == "en":
        return messages
    if MarianTokenizer is None or MarianMTModel is None:
        return messages
    if not isinstance(messages, list):
        return messages
    translated = []
    for message in messages:
        if not isinstance(message, dict):
            translated.append(message)
            continue
        updated = dict(message)
        text = updated.get("text")
        if isinstance(text, str) and _should_translate_outbound(text):
            updated["text"] = _translate_text(text, "en", target_lang)
        buttons = updated.get("buttons")
        if isinstance(buttons, list):
            new_buttons = []
            for button in buttons:
                if not isinstance(button, dict):
                    new_buttons.append(button)
                    continue
                button_copy = dict(button)
                title = button_copy.get("title")
                if isinstance(title, str) and _should_translate_outbound(title):
                    button_copy["title"] = _translate_text(title, "en", target_lang)
                new_buttons.append(button_copy)
            updated["buttons"] = new_buttons
        translated.append(updated)
    return translated

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LocationPayload(BaseModel):
    text: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    source: Optional[str] = None


class ChatRequest(BaseModel):
    sender_id: str
    message: str
    locale: Optional[str] = None
    location: Optional[LocationPayload] = None


class HandoffMessageRequest(BaseModel):
    request_id: int
    sender: str
    text: str


class HandoffStatusRequest(BaseModel):
    status: str
    suppress_close_message: bool = False


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminTablePayload(BaseModel):
    data: dict


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# Hashes a password with salt and returns the hex digest.
def _hash_password(password: str) -> str:
    salted = f"{ADMIN_PASSWORD_SALT}:{password}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


# Extracts the bearer token and returns it.
def _get_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip()


# Validates auth and returns the token info dict.
def _require_auth(authorization: Optional[str], roles: Optional[set] = None) -> dict:
    token = _get_token(authorization)
    if not token or token not in TOKEN_STORE:
        raise HTTPException(status_code=401, detail="Unauthorized")
    info = TOKEN_STORE[token]
    if roles and info.get("user_type") not in roles:
        raise HTTPException(status_code=403, detail="Forbidden")
    return info


# Fetches severe alerts and returns a list.
def _fetch_bund_alerts() -> list:
    alerts = []
    for source, url in BUND_ALERT_SOURCES.items():
        try:
            response = requests.get(url, timeout=8)
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError):
            continue
        if not isinstance(payload, list):
            continue
        # Keep only severe/extreme alerts and prefer EN title with DE fallback.
        for item in payload:
            severity = str(item.get("severity") or "").strip()
            if severity.lower() not in ALERT_SEVERITY_LEVELS:
                continue
            titles = item.get("i18nTitle") or {}
            title_en = titles.get("en")
            title_de = titles.get("de")
            title = title_en or title_de or str(item.get("id") or "Alert")
            alerts.append(
                {
                    "id": item.get("id"),
                    "version": item.get("version"),
                    "severity": severity,
                    "type": item.get("type"),
                    "title": title,
                    "title_en": title_en,
                    "title_de": title_de,
                    "source": source.upper(),
                    "startDate": item.get("startDate"),
                }
            )
    order = {"extreme": 0, "severe": 1}
    alerts.sort(key=lambda alert: (order.get(str(alert.get("severity", "")).lower(), 2), alert.get("title", "")))
    return alerts


# Converts a DB row to a dict and returns it.
def _serialize_row(columns, row):
    payload = {}
    for key, value in zip(columns, row):
        if hasattr(value, "isoformat"):
            payload[key] = value.isoformat()
        else:
            payload[key] = value
    return payload


# Builds a short address label and returns it.
def _format_address(address):
    if not address:
        return None
    road = address.get("road") or address.get("pedestrian") or address.get("footway")
    house_number = address.get("house_number")
    postcode = address.get("postcode")
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county")
    )
    if road and house_number:
        street = f"{road} {house_number}"
    else:
        street = road or house_number
    parts = []
    if street:
        parts.append(street)
    if postcode and city:
        parts.append(f"{postcode} {city}")
    elif city:
        parts.append(city)
    return ", ".join(parts) if parts else None


# Converts a model to dict and returns it.
def _model_to_dict(model):
    if model is None:
        return None
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


# Reads table metadata and returns columns and primary key.
def _fetch_table_meta(cur, table: str):
    cur.execute(
        """
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    )
    columns = [
        {
            "name": row[0],
            "data_type": row[1],
            "nullable": row[2] == "YES",
            "default": row[3],
        }
        for row in cur.fetchall()
    ]
    cur.execute(
        """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = %s
          AND tc.constraint_type = 'PRIMARY KEY'
        """,
        (table,),
    )
    pk_row = cur.fetchone()
    primary_key = pk_row[0] if pk_row else None
    return columns, primary_key


# Simple health check endpoint that returns ok.
@app.get("/api/health")
def health():
    return {"status": "ok"}


# Sends a message to Rasa and returns the translated reply list.
@app.post("/api/message")
def send_message(payload: ChatRequest):
    request_start = time.perf_counter()
    metadata = {}
    locale = _normalize_locale(payload.locale)
    if payload.locale:
        metadata["locale"] = payload.locale
    if payload.location:
        metadata["location"] = _model_to_dict(payload.location)
        if payload.location.lat is not None and payload.location.lon is not None:
            metadata["lat"] = payload.location.lat
            metadata["lon"] = payload.location.lon

    message_text = payload.message
    translate_in_time = 0.0
    if locale in {"tr", "de"} and _should_translate_inbound(message_text):
        t0 = time.perf_counter()
        message_text = _translate_text(message_text, locale, "en")
        translate_in_time = time.perf_counter() - t0

    try:
        t1 = time.perf_counter()
        response = requests.post(
            RASA_URL,
            json={
                "sender": payload.sender_id,
                "message": message_text,
                "metadata": metadata,
            },
            timeout=30,
        )
        response.raise_for_status()
        rasa_time = time.perf_counter() - t1
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    messages = response.json()
    t2 = time.perf_counter()
    translated_messages = _translate_messages(messages, locale)
    translate_out_time = time.perf_counter() - t2
    total_time = time.perf_counter() - request_start
    print(
        "[Timing] total={:.3f}s translate_in={:.3f}s rasa={:.3f}s translate_out={:.3f}s locale={}".format(
            total_time, translate_in_time, rasa_time, translate_out_time, locale
        )
    )
    return {"messages": translated_messages}


# Accepts audio, transcribes it, and returns the text.
@app.post("/api/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    locale: Optional[str] = Form(None),
):
    if not audio:
        raise HTTPException(status_code=400, detail="Missing audio file.")

    suffix = Path(audio.filename or "").suffix or ".webm"
    lang = _normalize_locale(locale)
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set. Transcription uses the OpenAI API.",
        )
    text = _transcribe_with_openai(content, audio.filename or f"audio{suffix}", lang)
    return {"text": text}


# Validates login and returns a token and user type.
@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, password_hash, user_type
                FROM users
                WHERE lower(username) = lower(%s)
                """,
                (payload.username,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id, username, password_hash, user_type = row
    if password_hash != _hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = secrets.token_hex(16)
    TOKEN_STORE[token] = {
        "user_id": user_id,
        "username": username,
        "user_type": user_type,
    }

    return {"token": token, "user_type": user_type}


# Updates the user password and returns ok.
@app.post("/api/admin/change-password")
def admin_change_password(
    payload: ChangePasswordRequest,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    current_hash = _hash_password(payload.current_password)
    if not payload.new_password:
        raise HTTPException(status_code=400, detail="New password required")
    new_hash = _hash_password(payload.new_password)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM users WHERE id = %s",
                (info["user_id"],),
            )
            row = cur.fetchone()
            if not row or row[0] != current_hash:
                raise HTTPException(status_code=400, detail="Invalid current password")
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (new_hash, info["user_id"]),
            )

    return {"ok": True}


# Returns the current admin user info.
@app.get("/api/admin/me")
def admin_me(authorization: Optional[str] = Header(default=None)):
    info = _require_auth(authorization)
    return {"user_type": info.get("user_type"), "username": info.get("username")}


# Returns the current severe alert list.
@app.get("/api/admin/alerts")
def admin_list_alerts(authorization: Optional[str] = Header(default=None)):
    _require_auth(authorization, roles={"admin"})
    return {"alerts": _fetch_bund_alerts()}


# Geocodes a query and returns matching locations.
@app.get("/api/geocode")
def geocode(query: str):
    if not query or len(query.strip()) < 3:
        return {"results": []}
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": 6,
        "addressdetails": 1,
        "countrycodes": "de",
    }
    headers = {"User-Agent": "crisisbot2/1.0 (geocode)"}
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers=headers,
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    allowed_classes = {
        "place",
        "boundary",
        "highway",
        "building",
        "address",
        "residential",
    }
    blocked_classes = {
        "waterway",
        "natural",
        "leisure",
        "tourism",
        "amenity",
        "railway",
        "aeroway",
        "man_made",
    }
    results = []
    for item in data:
        address = item.get("address") or {}
        if address.get("country_code") != "de":
            continue
        item_class = item.get("class")
        if item_class in blocked_classes:
            continue
        if item_class and item_class not in allowed_classes:
            continue
        label = _format_address(address) or item.get("display_name")
        results.append(
            {
                "display_name": item.get("display_name"),
                "label": label,
                "lat": item.get("lat"),
                "lon": item.get("lon"),
            }
        )
    return {"results": results}


# Reverse geocodes coordinates and returns a label.
@app.get("/api/reverse")
def reverse_geocode(lat: float, lon: float):
    params = {
        "lat": lat,
        "lon": lon,
        "format": "jsonv2",
        "addressdetails": 1,
        "zoom": 18,
    }
    headers = {"User-Agent": "crisisbot2/1.0 (reverse geocode)"}
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params=params,
            headers=headers,
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    address = data.get("address") or {}
    if address.get("country_code") != "de":
        return {"label": None}
    return {
        "label": _format_address(address) or data.get("display_name"),
        "display_name": data.get("display_name"),
    }


# Returns handoff requests for the queue.
@app.get("/api/handoff/requests")
def list_handoff_requests(status: Optional[str] = Query(default=None)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            if status:
                cur.execute(
                    """
                    SELECT hr.id, hr.conversation_id, hr.created_at, hr.status,
                           hr.risk_score, hr.crisis_type, hr.user_status, hr.user_channel,
                           hr.summary_json, hr.assigned_to,
                           hm.id AS last_message_id, hm.sender AS last_message_sender,
                           hm.created_at AS last_message_at
                    FROM handoff_requests hr
                    LEFT JOIN LATERAL (
                        SELECT id, sender, created_at
                        FROM handoff_messages
                        WHERE request_id = hr.id
                        ORDER BY id DESC
                        LIMIT 1
                    ) hm ON true
                    WHERE hr.status = %s
                    ORDER BY hr.created_at DESC
                    """,
                    (status,),
                )
            else:
                cur.execute(
                    """
                    SELECT hr.id, hr.conversation_id, hr.created_at, hr.status,
                           hr.risk_score, hr.crisis_type, hr.user_status, hr.user_channel,
                           hr.summary_json, hr.assigned_to,
                           hm.id AS last_message_id, hm.sender AS last_message_sender,
                           hm.created_at AS last_message_at
                    FROM handoff_requests hr
                    LEFT JOIN LATERAL (
                        SELECT id, sender, created_at
                        FROM handoff_messages
                        WHERE request_id = hr.id
                        ORDER BY id DESC
                        LIMIT 1
                    ) hm ON true
                    ORDER BY hr.created_at DESC
                    """
                )
            rows = cur.fetchall()

    items = [
        {
            "id": row[0],
            "conversation_id": row[1],
            "created_at": row[2].isoformat() if row[2] else None,
            "status": row[3],
            "risk_score": row[4],
            "crisis_type": row[5],
            "user_status": row[6],
            "user_channel": row[7],
            "summary_json": row[8],
            "assigned_to": row[9],
            "last_message_id": row[10],
            "last_message_sender": row[11],
            "last_message_at": row[12].isoformat() if row[12] else None,
        }
        for row in rows
    ]
    return {"requests": items}


# Returns handoff requests filtered by role.
@app.get("/api/admin/handoff/requests")
def admin_list_handoff_requests(
    status: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    if info.get("user_type") == "operator":
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT hr.id, hr.conversation_id, hr.created_at, hr.status,
                           hr.risk_score, hr.crisis_type, hr.user_status, hr.user_channel,
                           hr.summary_json, hr.assigned_to,
                           hm.id AS last_message_id, hm.sender AS last_message_sender,
                           hm.created_at AS last_message_at
                    FROM handoff_requests hr
                    LEFT JOIN LATERAL (
                        SELECT id, sender, created_at
                        FROM handoff_messages
                        WHERE request_id = hr.id
                        ORDER BY id DESC
                        LIMIT 1
                    ) hm ON true
                    WHERE hr.status IN ('open', 'assigned')
                      AND (hr.status = 'open' OR hr.assigned_to = %s)
                    ORDER BY hr.created_at DESC
                    """,
                    (info.get("username"),),
                )
                rows = cur.fetchall()
        items = [
            {
                "id": row[0],
                "conversation_id": row[1],
                "created_at": row[2].isoformat() if row[2] else None,
                "status": row[3],
                "risk_score": row[4],
                "crisis_type": row[5],
                "user_status": row[6],
                "user_channel": row[7],
                "summary_json": row[8],
                "assigned_to": row[9],
                "last_message_id": row[10],
                "last_message_sender": row[11],
                "last_message_at": row[12].isoformat() if row[12] else None,
            }
            for row in rows
        ]
        return {"requests": items}

    return list_handoff_requests(status=status)


# Returns the active handoff request for a conversation.
@app.get("/api/handoff/requests/active")
def get_active_request(conversation_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status
                FROM handoff_requests
                WHERE conversation_id = %s AND status IN ('open', 'assigned')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (conversation_id,),
            )
            row = cur.fetchone()
    if not row:
        return {"request": None}
    return {"request": {"id": row[0], "status": row[1]}}


# Returns handoff messages after the given id.
@app.get("/api/handoff/messages")
def list_handoff_messages(request_id: int, after_id: int = 0):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, sender, text, created_at
                FROM handoff_messages
                WHERE request_id = %s AND id > %s
                ORDER BY id
                """,
                (request_id, after_id),
            )
            rows = cur.fetchall()

    items = [
        {
            "id": row[0],
            "sender": row[1],
            "text": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
        }
        for row in rows
    ]
    return {"messages": items}


# Admin wrapper that returns handoff messages.
@app.get("/api/admin/handoff/messages")
def admin_list_handoff_messages(
    request_id: int,
    after_id: int = 0,
    authorization: Optional[str] = Header(default=None),
):
    _require_auth(authorization, roles={"admin", "operator"})
    return list_handoff_messages(request_id=request_id, after_id=after_id)


# Creates a handoff message and returns its id.
@app.post("/api/handoff/messages")
def create_handoff_message(payload: HandoffMessageRequest):
    if payload.sender not in {"user", "agent", "system"}:
        raise HTTPException(status_code=400, detail="Invalid sender")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO handoff_messages (request_id, sender, text)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (payload.request_id, payload.sender, payload.text),
            )
            message_id = cur.fetchone()[0]

            if payload.sender == "agent":
                cur.execute(
                    """
                    UPDATE handoff_requests
                    SET status = 'assigned'
                    WHERE id = %s AND status = 'open'
                    """,
                    (payload.request_id,),
                )

    return {"id": message_id}


# Creates a message with admin checks and returns its id.
@app.post("/api/admin/handoff/messages")
def admin_create_handoff_message(
    payload: HandoffMessageRequest,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT assigned_to, status FROM handoff_requests WHERE id = %s",
                (payload.request_id,),
            )
            row = cur.fetchone()
            assigned_to = row[0] if row else None
            status = row[1] if row else None
            assigned_now = False
            if payload.sender == "agent" and not assigned_to and status != "closed":
                cur.execute(
                    """
                    UPDATE handoff_requests
                    SET status = 'assigned', assigned_to = %s
                    WHERE id = %s AND assigned_to IS NULL
                    """,
                    (info.get("username"), payload.request_id),
                )
                assigned_now = cur.rowcount > 0
                if assigned_now:
                    assigned_to = info.get("username")
                    status = "assigned"
                    cur.execute(
                        """
                        INSERT INTO handoff_messages (request_id, sender, text)
                        VALUES (%s, %s, %s)
                        """,
                        (
                            payload.request_id,
                            "system",
                            f"Operator {assigned_to} joined the chat.",
                        ),
                    )
    if (
        payload.sender == "agent"
        and assigned_to
        and assigned_to != info.get("username")
        and info.get("user_type") != "admin"
    ):
        raise HTTPException(status_code=403, detail="Request already assigned")
    return create_handoff_message(payload)


# Updates handoff status and returns ok.
@app.post("/api/handoff/requests/{request_id}/status")
def update_handoff_status(request_id: int, payload: HandoffStatusRequest):
    if payload.status not in {"open", "assigned", "closed"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    with get_connection() as conn:
        with conn.cursor() as cur:
            if payload.status == "open" and payload.suppress_close_message:
                cur.execute(
                    """
                    DELETE FROM handoff_messages
                    WHERE request_id = %s
                      AND sender = 'system'
                      AND text = %s
                    """,
                    (request_id, "User left the chat. Session closed."),
                )
            cur.execute(
                "UPDATE handoff_requests SET status = %s WHERE id = %s",
                (payload.status, request_id),
            )
    return {"ok": True}


# Updates handoff status with auth and returns ok.
@app.post("/api/admin/handoff/requests/{request_id}/status")
def admin_update_handoff_status(
    request_id: int,
    payload: HandoffStatusRequest,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    status = payload.status
    assigned_to = None
    if status == "assigned":
        assigned_to = info.get("username")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, assigned_to FROM handoff_requests WHERE id = %s",
                (request_id,),
            )
            previous = cur.fetchone() or (None, None)
            prev_status, prev_assigned_to = previous[0], previous[1]
            if status == "open":
                cur.execute(
                    "UPDATE handoff_requests SET status = %s, assigned_to = NULL WHERE id = %s",
                    (status, request_id),
                )
            elif assigned_to:
                cur.execute(
                    "UPDATE handoff_requests SET status = %s, assigned_to = %s WHERE id = %s",
                    (status, assigned_to, request_id),
                )
                if prev_status != "assigned" or prev_assigned_to != assigned_to:
                    cur.execute(
                        """
                        INSERT INTO handoff_messages (request_id, sender, text)
                        VALUES (%s, %s, %s)
                        """,
                        (
                            request_id,
                            "system",
                            f"Operator {assigned_to} joined the chat.",
                        ),
                    )
            else:
                cur.execute(
                    "UPDATE handoff_requests SET status = %s WHERE id = %s",
                    (status, request_id),
                )
    return {"ok": True}


# Returns the tables the user is allowed to manage.
@app.get("/api/admin/tables")
def list_admin_tables(authorization: Optional[str] = Header(default=None)):
    info = _require_auth(authorization, roles={"admin", "operator"})
    if info.get("user_type") == "operator":
        return {"tables": sorted(OPERATOR_TABLES)}
    return {"tables": sorted(ADMIN_TABLES)}


# Returns table metadata and rows for admin.
@app.get("/api/admin/table/{table_name}")
def get_admin_table(
    table_name: str,
    limit: int = 50,
    offset: int = 0,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    allowed = ADMIN_TABLES if info.get("user_type") == "admin" else OPERATOR_TABLES
    if table_name not in allowed:
        raise HTTPException(status_code=404, detail="Table not allowed")

    with get_connection() as conn:
        with conn.cursor() as cur:
            columns_meta, primary_key = _fetch_table_meta(cur, table_name)
            columns = [col["name"] for col in columns_meta]
            query = sql.SQL("SELECT {fields} FROM {table} LIMIT %s OFFSET %s").format(
                fields=sql.SQL(", ").join(map(sql.Identifier, columns)),
                table=sql.Identifier(table_name),
            )
            cur.execute(query, (limit, offset))
            rows = cur.fetchall()

    return {
        "columns": columns_meta,
        "primary_key": primary_key,
        "rows": [_serialize_row(columns, row) for row in rows],
    }


# Creates a row in the selected table and returns ok.
@app.post("/api/admin/table/{table_name}")
def create_admin_row(
    table_name: str,
    payload: AdminTablePayload,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    allowed = ADMIN_TABLES if info.get("user_type") == "admin" else OPERATOR_TABLES
    if table_name not in allowed:
        raise HTTPException(status_code=404, detail="Table not allowed")

    data = dict(payload.data or {})
    if table_name == "users" and "password" in data:
        data["password_hash"] = _hash_password(str(data.pop("password")))

    with get_connection() as conn:
        with conn.cursor() as cur:
            columns_meta, primary_key = _fetch_table_meta(cur, table_name)
            columns = [col["name"] for col in columns_meta]
            if primary_key in data:
                data.pop(primary_key, None)
            insert_columns = [key for key in data.keys() if key in columns]
            if not insert_columns:
                raise HTTPException(status_code=400, detail="No valid columns")

            query = sql.SQL("INSERT INTO {table} ({fields}) VALUES ({values})").format(
                table=sql.Identifier(table_name),
                fields=sql.SQL(", ").join(map(sql.Identifier, insert_columns)),
                values=sql.SQL(", ").join(sql.Placeholder() for _ in insert_columns),
            )
            cur.execute(query, [data[key] for key in insert_columns])

    return {"ok": True}


# Updates a table row and returns ok.
@app.put("/api/admin/table/{table_name}/{row_id}")
def update_admin_row(
    table_name: str,
    row_id: str,
    payload: AdminTablePayload,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    allowed = ADMIN_TABLES if info.get("user_type") == "admin" else OPERATOR_TABLES
    if table_name not in allowed:
        raise HTTPException(status_code=404, detail="Table not allowed")

    data = dict(payload.data or {})
    if table_name == "users" and "password" in data:
        data["password_hash"] = _hash_password(str(data.pop("password")))

    with get_connection() as conn:
        with conn.cursor() as cur:
            if table_name == "users":
                cur.execute(
                    "SELECT username FROM users WHERE id = %s",
                    (row_id,),
                )
                row = cur.fetchone()
                if row and row[0] == "crisos_admin":
                    raise HTTPException(
                        status_code=403,
                        detail="Protected user cannot be edited",
                    )
            columns_meta, primary_key = _fetch_table_meta(cur, table_name)
            if not primary_key:
                raise HTTPException(status_code=400, detail="No primary key")
            columns = [col["name"] for col in columns_meta]
            data.pop(primary_key, None)
            update_columns = [key for key in data.keys() if key in columns]
            if not update_columns:
                raise HTTPException(status_code=400, detail="No valid columns")

            assignments = [
                sql.SQL("{} = {}").format(sql.Identifier(col), sql.Placeholder())
                for col in update_columns
            ]
            if table_name == "supply_points":
                assignments.append(sql.SQL("updated_at = now()"))
            assignments_sql = sql.SQL(", ").join(assignments)
            query = sql.SQL("UPDATE {table} SET {assignments} WHERE {pk} = %s").format(
                table=sql.Identifier(table_name),
                assignments=assignments_sql,
                pk=sql.Identifier(primary_key),
            )
            cur.execute(query, [data[col] for col in update_columns] + [row_id])

    return {"ok": True}


# Deletes a table row and returns ok.
@app.delete("/api/admin/table/{table_name}/{row_id}")
def delete_admin_row(
    table_name: str,
    row_id: str,
    authorization: Optional[str] = Header(default=None),
):
    info = _require_auth(authorization, roles={"admin", "operator"})
    allowed = ADMIN_TABLES if info.get("user_type") == "admin" else OPERATOR_TABLES
    if table_name not in allowed:
        raise HTTPException(status_code=404, detail="Table not allowed")

    with get_connection() as conn:
        with conn.cursor() as cur:
            if table_name == "users":
                cur.execute(
                    "SELECT username FROM users WHERE id = %s",
                    (row_id,),
                )
                row = cur.fetchone()
                if row and row[0] == "crisos_admin":
                    raise HTTPException(
                        status_code=403,
                        detail="Protected user cannot be deleted",
                    )
            _, primary_key = _fetch_table_meta(cur, table_name)
            if not primary_key:
                raise HTTPException(status_code=400, detail="No primary key")
            query = sql.SQL("DELETE FROM {table} WHERE {pk} = %s").format(
                table=sql.Identifier(table_name),
                pk=sql.Identifier(primary_key),
            )
            cur.execute(query, (row_id,))

    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
