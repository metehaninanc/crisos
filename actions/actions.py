from typing import Any, Text, Dict, List, Optional, Tuple
import os
from pathlib import Path
import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
import requests
from rasa_sdk import Action, Tracker, FormValidationAction
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet, FollowupAction, ActiveLoop
from rasa_sdk.types import DomainDict

try:
    from db.connection import get_connection
except ImportError:
    from connection import get_connection

dspy = None

try:
    import faiss
except Exception:  # pragma: no cover - optional dependency
    faiss = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - optional dependency
    SentenceTransformer = None

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency
    PdfReader = None

RAG_SOURCES_DIR = Path(__file__).resolve().parents[1] / "rag_sources"
RAG_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
RAG_RETRIEVE_K = 15
RAG_CHUNK_TOKENS = 450
RAG_CHUNK_OVERLAP_TOKENS = 80
RAG_MIN_SCORE = 0.25
RAG_REFUSE_IF_NO_EVIDENCE = True
RAG_ANSWER_FORMAT = "checklist"
RAG_INDEX = None
RAG_CHUNKS: List[str] = []
RAG_META: List[Dict[str, Any]] = []
RAG_MODEL = None
DSPY_CONFIGURED = False
RAG_WARMUP_DONE = False


def _try_import_dspy():
    global dspy
    if dspy is not None:
        return dspy
    enable = os.getenv("ENABLE_DSPY", "").lower() in ("1", "true", "yes")
    if not enable:
        return None
    try:
        import dspy as _dspy
    except Exception as exc:
        print(f"[RAG] DSPy import failed: {exc}")
        return None
    dspy = _dspy
    return dspy


def _split_text(
    text: str,
    chunk_tokens: int = RAG_CHUNK_TOKENS,
    overlap_tokens: int = RAG_CHUNK_OVERLAP_TOKENS,
) -> List[str]:
    if not text:
        return []
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    chunks: List[str] = []
    tokens = normalized.split(" ")
    start = 0
    length = len(tokens)
    while start < length:
        end = min(start + chunk_tokens, length)
        chunk = " ".join(tokens[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(end - overlap_tokens, 0)
        if start >= end:
            start = end
    return chunks


def _load_rag_sources() -> bool:
    global RAG_INDEX, RAG_CHUNKS, RAG_META, RAG_MODEL
    if RAG_INDEX is not None:
        return True
    if faiss is None or SentenceTransformer is None or PdfReader is None:
        return False
    if not RAG_SOURCES_DIR.exists():
        return False

    # Build an in-memory search index from PDF sources for fast retrieval.
    documents: List[str] = []
    meta: List[Dict[str, Any]] = []
    for pdf_path in sorted(RAG_SOURCES_DIR.glob("*.pdf")):
        try:
            reader = PdfReader(str(pdf_path))
        except Exception:
            continue
        for page_index, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            for chunk in _split_text(text):
                documents.append(chunk)
                meta.append(
                    {
                        "source": pdf_path.name,
                        "page": page_index,
                    }
                )

    if not documents:
        return False

    # Embed all chunks once and keep the FAISS index in memory.
    RAG_MODEL = SentenceTransformer(RAG_EMBEDDING_MODEL)
    embeddings = RAG_MODEL.encode(documents)
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings)

    RAG_INDEX = index
    RAG_CHUNKS = documents
    RAG_META = meta
    return True


def _warmup_rag() -> None:
    global RAG_WARMUP_DONE
    if RAG_WARMUP_DONE:
        return
    enable = os.getenv("RAG_WARMUP", "true").lower() in ("1", "true", "yes")
    if not enable:
        return
    try:
        print("[RAG] Warmup started.")
        _load_rag_sources()
    finally:
        RAG_WARMUP_DONE = True
        print("[RAG] Warmup finished.")


_warmup_rag()


def _retrieve_rag_context(question: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    if not question:
        return [], []
    if not _load_rag_sources():
        return [], []
    # Use vector search to fetch top-k relevant chunks for the user query.
    query_embedding = RAG_MODEL.encode([question])
    distances, indices = RAG_INDEX.search(query_embedding, RAG_RETRIEVE_K)
    contexts: List[str] = []
    sources: List[Dict[str, Any]] = []
    for distance, idx in zip(distances[0], indices[0]):
        if idx < 0 or idx >= len(RAG_CHUNKS):
            continue
        score = 1.0 / (1.0 + float(distance))
        if score < RAG_MIN_SCORE:
            continue
        contexts.append(RAG_CHUNKS[idx])
        sources.append({**RAG_META[idx], "score": score})
    return contexts, sources


class _OpenAIChatLLM:
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def basic_request(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "temperature": 0.1,
            "max_tokens": 250,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a crisis-assistant bot. Use only the provided context. "
                        "If the answer is not in the context, say: "
                        "\"This question is not answered in the official documents we have. "
                        "To avoid misinformation, I can't provide an answer right now.\" "
                        "Be concise and clear."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        }
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()

    def __call__(self, prompt: str, **kwargs) -> str:
        return self.basic_request(prompt)


def _get_openai_llm() -> Optional[_OpenAIChatLLM]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    return _OpenAIChatLLM(api_key=api_key, model=model)


def _configure_dspy() -> Optional[_OpenAIChatLLM]:
    global DSPY_CONFIGURED
    dspy_module = _try_import_dspy()
    if dspy_module is None:
        return None
    if DSPY_CONFIGURED:
        return dspy_module.settings.lm
    lm = _get_openai_llm()
    if lm is None:
        return None
    dspy_module.settings.configure(lm=lm)
    DSPY_CONFIGURED = True
    return lm


def _rag_dspy_answer(question: str) -> Optional[str]:
    contexts, sources = _retrieve_rag_context(question)
    if not contexts:
        if RAG_REFUSE_IF_NO_EVIDENCE:
            return (
                "This question is not answered in the official documents we have. "
                "To avoid misinformation, I can't provide an answer right now."
            )
        return None

    context_text = "\n\n".join(contexts)
    format_hint = ""
    if RAG_ANSWER_FORMAT.lower() == "checklist":
        format_hint = "Answer as a short checklist using bullet points."
    prompt = (
        f"Context:\n{context_text}\n\nQuestion: {question}\n"
        f"{format_hint}\nAnswer:"
    )

    lm = _get_openai_llm()
    if lm is None:
        return None

    dspy_module = _try_import_dspy()
    if dspy_module is not None and _configure_dspy() is not None:
        class RagAnswer(dspy_module.Signature):
            """Answer using the provided context."""

            question: str
            context: str
            answer: str

        class RagModule(dspy_module.Module):
            def __init__(self):
                super().__init__()
                self.generate = dspy_module.Predict(RagAnswer)

            def forward(self, question: str, context: str):
                return self.generate(question=question, context=context)

        module = RagModule()
        question_text = (
            f"{question}\nFormat: {RAG_ANSWER_FORMAT}"
            if format_hint
            else question
        )
        result = module(question=question_text, context=context_text)
        answer = str(result.answer).strip() if result and getattr(result, "answer", None) else ""
    else:
        answer = lm(prompt)

    if not answer:
        return None
    normalized = answer.lower().strip()
    if normalized in {"i do not know.", "i do not know", "i don't know.", "i don't know"}:
        return (
            "This question is not answered in the official documents we have. "
            "To avoid misinformation, I can't provide an answer right now."
        )
    return answer

def _normalize_city_name(city: Optional[str]) -> Optional[str]:
    if not city:
        return None
    clean = re.sub(r"\s*\(.*?\)\s*", "", str(city)).strip()
    replacements = {
        "\u00e4": "a",
        "\u00c4": "A",
        "\u00f6": "o",
        "\u00d6": "O",
        "\u00fc": "u",
        "\u00dc": "U",
        "\u00df": "ss",
    }
    for src, dst in replacements.items():
        clean = clean.replace(src, dst)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def _extract_city_candidates(location_text: str) -> List[str]:
    if not location_text:
        return []
    text = str(location_text).strip()
    if not text:
        return []

    country_tokens = {"germany", "deutschland", "de"}
    street_tokens = (
        "strasse", "str.", "str", "street", "road",
        "avenue", "ave", "platz", "allee", "ring", "gasse", "weg",
    )

    candidates: List[str] = []
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if parts:
        for part in reversed(parts):
            if part.lower() in country_tokens:
                continue
            part = re.sub(r"^\d{4,5}\s+", "", part)
            part = part.strip()
            if not part:
                continue
            if re.search(r"\d", part):
                if re.search(r"\b(" + "|".join(street_tokens) + r")\b", part, re.IGNORECASE):
                    continue
                part = re.sub(r"\d+", "", part).strip()
            if part:
                candidates.append(part)

    if not candidates:
        match = re.search(r"\b\d{4,5}\s+([^,]+)", text)
        if match:
            candidates.append(match.group(1).strip())

    return candidates


def _looks_like_location_text(text: str) -> bool:
    if not text:
        return False
    cleaned = text.strip()
    if not cleaned:
        return False
    if cleaned.startswith("/"):
        return False
    if cleaned.endswith("?"):
        return False
    lat, lon = _extract_lat_lon(cleaned, None)
    if lat is not None and lon is not None:
        return True
    lowered = cleaned.lower()
    address_tokens = (
        "strasse", "street", "road", "rd", "avenue", "ave", "platz",
        "allee", "ring", "gasse", "weg", "str.", "plz",
    )
    if any(token in lowered for token in address_tokens):
        return True
    if re.search(r"\d{4,5}", cleaned):
        return True
    candidates = _extract_city_candidates(cleaned)
    if candidates and len(cleaned.split()) <= 4:
        return True
    return False


def _build_city_variants(city: Optional[str]) -> List[str]:
    if not city:
        return []

    candidates: List[str] = []
    if isinstance(city, str):
        candidates.extend(_extract_city_candidates(city))
        candidates.append(city.strip())

    cleaned = _normalize_city_name(city)
    if cleaned:
        candidates.append(cleaned)

    seen = set()
    variants: List[str] = []
    for candidate in candidates:
        if not candidate:
            continue
        candidate = str(candidate).strip()
        if not candidate:
            continue
        normalized = _normalize_city_name(candidate) or candidate
        for value in (normalized, candidate):
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            variants.append(value)
    return variants


def _pick_display_city(candidates: List[str]) -> Optional[str]:
    if not candidates:
        return None
    normalized = _normalize_city_name(candidates[0])
    return normalized or candidates[0]



def _normalize_supply_category(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, list):
        value = value[0] if value else None
    if not value:
        return None
    text = str(value).strip().lower()
    mapping = {
        "food": "food",
        "water": "water",
        "baby_food": "baby_food",
        "baby food": "baby_food",
        "hygiene_kit": "hygiene_kit",
        "hygiene kit": "hygiene_kit",
        "accommodation": "accommodation",
    }
    return mapping.get(text, text.replace(" ", "_"))


def _parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_valid_lat_lon(lat: Optional[float], lon: Optional[float]) -> bool:
    if lat is None or lon is None:
        return False
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def _get_lat_lon_from_dict(data: Optional[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float]]:
    if not isinstance(data, dict):
        return None, None
    lat = data.get("lat")
    lon = data.get("lon")
    if lat is None:
        lat = data.get("latitude")
    if lon is None:
        lon = data.get("lng")
    if lon is None:
        lon = data.get("longitude")
    lat_f = _parse_float(lat)
    lon_f = _parse_float(lon)
    if _is_valid_lat_lon(lat_f, lon_f):
        return lat_f, lon_f

    for key in ("location", "coordinates", "geo"):
        nested = data.get(key)
        lat_f, lon_f = _get_lat_lon_from_dict(nested)
        if _is_valid_lat_lon(lat_f, lon_f):
            return lat_f, lon_f

    return None, None


def _extract_lat_lon(location_value: Any, metadata: Optional[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float]]:
    lat, lon = _get_lat_lon_from_dict(metadata or {})
    if lat is not None and lon is not None:
        return lat, lon

    if isinstance(location_value, dict):
        lat, lon = _get_lat_lon_from_dict(location_value)
        if lat is not None and lon is not None:
            return lat, lon

    if isinstance(location_value, str) and location_value.strip():
        text = location_value.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
                lat, lon = _get_lat_lon_from_dict(parsed)
                if lat is not None and lon is not None:
                    return lat, lon
            except json.JSONDecodeError:
                pass

        match = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", text)
        if match:
            lat = _parse_float(match.group(1))
            lon = _parse_float(match.group(2))
            if _is_valid_lat_lon(lat, lon):
                return lat, lon

    return None, None


def _fetch_json(url: str, headers: Optional[Dict[str, str]] = None,
                timeout: int = 8) -> Optional[Dict[str, Any]]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
        return json.loads(data)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None


def _clean_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = str(value).replace("\r", " ").replace("\n", " ").strip()
    return re.sub(r"\s+", " ", text).strip() or None


def _clean_html_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = html.unescape(str(value))
    text = re.sub(r"<\s*br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</\s*p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip() or None


def extract_city(address: str) -> Optional[str]:
    if not address:
        return None
    match = re.search(r"\b\d{5}\s+([A-Za-z][A-Za-z\s\-]+)", address)
    return match.group(1).strip() if match else None


def _get_ars_code(address: str) -> Optional[str]:
    if not address:
        return None

    address = extract_city(address)
    if not address:
        return None

    params = {
        "q": address,
        "format": "jsonv2",
        "addressdetails": 1,
        "extratags": 1,
        "limit": 1,
    }
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": "crisisbot2/1.0 (official warnings lookup)"}
    data = _fetch_json(url, headers=headers)
    if not data or not isinstance(data, list):
        return None
    first = data[0] or {}
    extratags = first.get("extratags") or {}
    return extratags.get("de:regionalschluessel")

def _extract_warning_id(payload: Any) -> Optional[str]:
    items = None
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("warnings") or payload.get("data") or payload.get("messages")
    if not isinstance(items, list) or not items:
        return None
    first = items[0] or {}
    return first.get("id") or first.get("identifier")


def _select_warning_info(payload: Any) -> Optional[Dict[str, Any]]:
    info_list = None
    if isinstance(payload, dict):
        info_list = payload.get("info")
    if not isinstance(info_list, list) or not info_list:
        return None
    for info in info_list:
        if isinstance(info, dict) and info.get("language") == "en":
            return info
    for info in info_list:
        if isinstance(info, dict):
            return info
    return None


def _geocode_city(location_text: str) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    if not location_text:
        return None, None, None
    params = {
        "format": "json",
        "limit": 1,
        "q": location_text,
        "countrycodes": "de",
    }
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": "crisisbot2/1.0 (weather lookup)"}
    data = _fetch_json(url, headers=headers)
    if not data or not isinstance(data, list):
        return None, None, None
    first = data[0]
    lat = _parse_float(first.get("lat"))
    lon = _parse_float(first.get("lon"))
    name = first.get("display_name")
    if lat is None or lon is None:
        return None, None, None
    return lat, lon, name


def _format_timestamp(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, str):
        cleaned = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(cleaned)
            return parsed.strftime("%Y-%m-%d %H:%M UTC")
        except ValueError:
            return value
    return None


def _fetch_pegel_stations(lat: float, lon: float, radius_km: int = 5) -> List[Dict[str, Any]]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "radius": radius_km,
        "includeMeasurements": "true",
        "includeTimeseries": "true",
        "includeCurrentMeasurement": "true",
    }
    url = (
        "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?"
        + urllib.parse.urlencode(params)
    )
    data = _fetch_json(url)
    if isinstance(data, list):
        return data
    return []


def _fetch_elevation(lat: float, lon: float) -> Optional[float]:
    params = {"latitude": lat, "longitude": lon}
    url = "https://api.open-meteo.com/v1/elevation?" + urllib.parse.urlencode(params)
    data = _fetch_json(url)
    if not isinstance(data, dict):
        return None
    value = data.get("elevation")
    return _parse_float(value)


def _extract_current_measurement(station: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    timeseries = station.get("timeseries") or []
    for series in timeseries:
        current = series.get("currentMeasurement")
        if current:
            return series, current
    return None, None


def _build_handoff_summary(tracker: Tracker, max_messages: int = 10) -> str:
    slots = tracker.current_slot_values() or {}
    metadata = tracker.latest_message.get("metadata") or {}
    lat, lon = _get_lat_lon_from_dict(metadata)
    if lat is not None and lon is not None:
        slots["lat"] = lat
        slots["lon"] = lon
    messages: List[Dict[str, str]] = []
    for event in reversed(tracker.events or []):
        event_type = event.get("event")
        if event_type == "user":
            text = event.get("text")
            if text:
                messages.append({"sender": "user", "text": text})
        elif event_type == "bot":
            text = event.get("text")
            if text:
                messages.append({"sender": "bot", "text": text})
        if len(messages) >= max_messages:
            break
    messages.reverse()
    summary = {"slots": slots, "last_messages": messages}
    return json.dumps(summary, default=str)


def _get_active_handoff_request(cur, conversation_id: str) -> Optional[int]:
    cur.execute(
        """
        SELECT id
        FROM handoff_requests
        WHERE conversation_id = %s AND status IN ('open', 'assigned')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (conversation_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _insert_handoff_message(cur, request_id: int, sender: str, text: str) -> Optional[int]:
    cur.execute(
        """
        INSERT INTO handoff_messages (request_id, sender, text)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (request_id, sender, text),
    )
    row = cur.fetchone()
    return row[0] if row else None

class ActionSetUserStatus(Action):
    """Detect and set user status based on intent"""
    
    def name(self) -> Text:
        return "action_set_user_status"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        intent = tracker.latest_message.get('intent', {}).get('name')
        
        status_map = {
            'report_emergency': 'emergency',
            'report_trapped': 'trapped_safe',
            'report_safe': 'safe'
        }
        
        user_status = status_map.get(intent, None)
        
        if user_status:
            return [SlotSet("user_status", user_status)]
        
        return []


class ActionDetectCrisisType(Action):
    """Detect crisis type from user intent or form input"""
    
    def name(self) -> Text:
        return "action_detect_crisis_type"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        intent = tracker.latest_message['intent'].get('name')
        
        crisis_mapping = {
            'report_flood': 'flood',
            'report_wildfire': 'wildfire',
            'report_outage': 'power_outage'
        }
        
        crisis_type = crisis_mapping.get(intent)
        
        if crisis_type:
            return [SlotSet("crisis_type", crisis_type)]
        
        return []

class ActionCalculateRiskScore(Action):
    """Calculate risk score based on all collected information"""
    
    def name(self) -> Text:
        return "action_calculate_risk_score"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        risk_score = 0
        
        # Medical status (0-70).
        need_medical = tracker.get_slot("need_medical")
        medical_scores = {
            "none": 0,
            "medications": 25,
            "injured": 45,
            "critical": 70
        }
        risk_score += medical_scores.get(need_medical, 0)
        
        # Person count (0-20).
        person_count = tracker.get_slot("person_count")
        if person_count:
            try:
                count = int(person_count)
                if count == 1:
                    risk_score += 0
                elif count in [2, 3]:
                    risk_score += 10
                elif count in [4, 5, 6]:
                    risk_score += 15
                else:  # 7+
                    risk_score += 20
            except:
                pass
        
        # Vulnerable groups (0-20).
        vulnerable = tracker.get_slot("vulnerable_group")
        if vulnerable == "yes":
            risk_score += 20
        
        # Mobility needs (0-10).
        mobility = tracker.get_slot("mobility_needs")
        if mobility == "yes":
            risk_score += 10
        
        crisis_type = tracker.get_slot("crisis_type")
        
        if crisis_type == "flood":
            risk_score += self._calculate_flood_risk(tracker)
        
        elif crisis_type == "wildfire":
            risk_score += self._calculate_wildfire_risk(tracker)
        
        elif crisis_type == "power_outage":
            risk_score += self._calculate_outage_risk(tracker)
        
        if risk_score >= 70:
            risk_level = "high"
        elif risk_score >= 45:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Escalate for medium/high risk; otherwise provide guidance.
        if risk_level == "high":
            dispatcher.utter_message(response="utter_high_risk_handover")
            return [
                SlotSet("risk_score", risk_score),
                SlotSet("risk_level", risk_level),
                FollowupAction("action_escalate_to_operator")
            ]
        
        elif risk_level == "medium":
            dispatcher.utter_message(response="utter_medium_risk_info")
            return [
                SlotSet("risk_score", risk_score),
                SlotSet("risk_level", risk_level),
                FollowupAction("action_escalate_to_operator")
            ]
        
        else:
            dispatcher.utter_message(response="utter_low_risk_info")
            return [
                SlotSet("risk_score", risk_score),
                SlotSet("risk_level", risk_level)
            ]
    
    def _calculate_flood_risk(self, tracker: Tracker) -> int:
        """Calculate flood-specific risk"""
        score = 0
        
        # Water level (0-45).
        water_level = tracker.get_slot("water_level")
        water_scores = {
            "below_10cm": 5,
            "10cm_30cm": 15,
            "30cm_60cm": 30,
            "above_60cm": 45
        }
        score += water_scores.get(water_level, 0)
        
        # Water trend (0-25).
        water_trend = tracker.get_slot("water_trend")
        trend_scores = {
            "none": 0,
            "stable": 0,
            "slowly_rising": 15,
            "rising_fast": 25
        }
        score += trend_scores.get(water_trend, 0)
        
        # Floor info (0-25).
        floor_info = tracker.get_slot("floor_info")
        floor_scores = {
            "basement": 25,
            "ground": 15,
            "upper_floor": 0
        }
        score += floor_scores.get(floor_info, 0)
        
        # Power outage (0-20).
        power_outage = tracker.get_slot("power_outage")
        if power_outage == "yes":
            score += 20
        
        # Hazard type (0-30).
        hazard = tracker.get_slot("hazard_type")
        hazard_scores = {
            "none": 0,
            "gas_smell": 25,
            "electricity_risk": 25,
            "fire": 30
        }
        score += hazard_scores.get(hazard, 0)
        
        return score
    
    def _calculate_wildfire_risk(self, tracker: Tracker) -> int:
        """Calculate wildfire-specific risk"""
        score = 0
        
        # Fire distance (0-45).
        fire_distance = tracker.get_slot("fire_distance")
        distance_scores = {
            "none": 0,
            "visible": 10,
            "nearby": 20,
            "surrounding": 45
        }
        score += distance_scores.get(fire_distance, 0)
        
        # Smoke inhalation (0-45).
        smoke = tracker.get_slot("smoke_inhalation")
        smoke_scores = {
            "none": 0,
            "slightly_difficult": 15,
            "cant_breathe": 45
        }
        score += smoke_scores.get(smoke, 0)
        
        # Vehicle access (0-20).
        vehicle = tracker.get_slot("vehicle_access")
        if vehicle == "no_vehicle":
            score += 20
        
        return score
    
    def _calculate_outage_risk(self, tracker: Tracker) -> int:
        """Calculate power outage-specific risk"""
        score = 0
        
        # Heating/cooling risk (0-35).
        temp_risk = tracker.get_slot("heating_cooling_risk")
        temp_scores = {
            "normal": 0,
            "uncomfortable": 25,
            "dangerous": 35
        }
        score += temp_scores.get(temp_risk, 0)
        
        # Building floor (0-15).
        floor = tracker.get_slot("building_floor")
        floor_scores = {
            "ground_1st": 0,
            "2_4": 10,
            "5_plus": 15
        }
        score += floor_scores.get(floor, 0)
        
        # Duration (0-30).
        duration = tracker.get_slot("duration_estimate")
        duration_scores = {
            "below_6hours": 5,
            "6h_24h": 15,
            "above_24h": 30
        }
        score += duration_scores.get(duration, 0)
        
        return score


class ValidateEmergencyAssessmentForm(FormValidationAction):
    """Dynamic form validation for the emergency flow."""

    def name(self) -> Text:
        return "validate_emergency_assessment_form"

    async def required_slots(
        self,
        domain_slots: List[Text],
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Text]:

        required: List[Text] = ["need_medical"]

        need_medical = tracker.get_slot("need_medical")
        if not need_medical:
            return required

        if need_medical == "critical":
            return []

        if need_medical in ["none", "medications"]:
            required.append("location")

            if tracker.get_slot("location"):
                required.append("person_count")

            return required

        if need_medical == "injured":
            required.append("location")
            return required

        return required

class ValidateTrappedAssessmentForm(FormValidationAction):
    """Dynamic form validation with conditional slot requirements"""
    
    def name(self) -> Text:
        return "validate_trapped_assessment_form"
    
    async def required_slots(
        self,
        domain_slots: List[Text],
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Text]:
        
        required = ["location", "need_medical", "person_count"]
        current_risk = self._calculate_current_risk(tracker)
        if current_risk >= 70:
            return []
        person_count = tracker.get_slot("person_count")
        if person_count:
            try:
                if int(person_count) > 1:
                    required.append("vulnerable_group")
                    
                    vulnerable = tracker.get_slot("vulnerable_group")
                    if vulnerable == "yes":
                        required.append("mobility_needs")
            except:
                pass
        
        crisis_type = tracker.get_slot("crisis_type")
        if not crisis_type:
            required.append("crisis_type")
            return required  # Stop here until crisis type is known
        if crisis_type == "flood":
            required.append("water_level")
            
            water_level = tracker.get_slot("water_level")
            if water_level and water_level != "below_10cm":
                required.extend(["water_trend", "floor_info", "power_outage"])
            
            required.append("hazard_type")
        
        elif crisis_type == "wildfire":
            required.extend([
                "fire_distance",
                "smoke_inhalation",
                "vehicle_access"
            ])
        
        elif crisis_type == "power_outage":
            required.extend([
                "heating_cooling_risk",
                "building_floor",
                "duration_estimate"
            ])
        
        return required


class ValidateSafeInfoForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_safe_info_form"

    async def validate_location(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        user_text = (tracker.latest_message.get("text") or "").strip()
        if not user_text:
            return {"location": None}
        if _looks_like_location_text(user_text):
            return {"location": user_text}
        rag_answer = _rag_dspy_answer(user_text)
        if rag_answer:
            dispatcher.utter_message(text=rag_answer)
        return {"location": None}

    def _has_recent_high_risk_message(self, tracker: Tracker) -> bool:
        for event in reversed(tracker.events or []):
            if event.get("event") == "bot":
                text = event.get("text") or ""
                return "HIGH RISK DETECTED" in text
        return False

    def _calculate_current_risk(self, tracker: Tracker) -> int:
        """Calculate a partial risk score from whatever slots are already filled.

        Used for early termination of the form (e.g., critical medical need).
        """
        risk_score = 0

        need_medical = tracker.get_slot("need_medical")
        medical_scores = {
            "none": 0,
            "medications": 25,
            "injured": 45,
            "critical": 70,
        }
        risk_score += medical_scores.get(need_medical, 0)

        person_count = tracker.get_slot("person_count")
        if person_count:
            try:
                count = int(person_count)
                if count == 1:
                    risk_score += 0
                elif count in [2, 3]:
                    risk_score += 10
                elif count in [4, 5, 6]:
                    risk_score += 15
                else:
                    risk_score += 20
            except Exception:
                pass

        if tracker.get_slot("vulnerable_group") == "yes":
            risk_score += 20

        if tracker.get_slot("mobility_needs") == "yes":
            risk_score += 10

        crisis_type = tracker.get_slot("crisis_type")
        if crisis_type == "flood":
            water_scores = {
                "below_10cm": 5,
                "10cm_30cm": 15,
                "30cm_60cm": 30,
                "above_60cm": 45,
            }
            risk_score += water_scores.get(tracker.get_slot("water_level"), 0)

            trend_scores = {
                "none": 0,
                "stable": 0,
                "slowly_rising": 15,
                "rising_fast": 25,
            }
            risk_score += trend_scores.get(tracker.get_slot("water_trend"), 0)

            floor_scores = {"basement": 25, "ground": 15, "upper_floor": 0}
            risk_score += floor_scores.get(tracker.get_slot("floor_info"), 0)

            if tracker.get_slot("power_outage") == "yes":
                risk_score += 20

            hazard_scores = {
                "none": 0,
                "gas_smell": 25,
                "electricity_risk": 25,
                "fire": 30,
            }
            risk_score += hazard_scores.get(tracker.get_slot("hazard_type"), 0)

        elif crisis_type == "wildfire":
            distance_scores = {"none": 0, "visible": 10, "nearby": 20, "surrounding": 45}
            risk_score += distance_scores.get(tracker.get_slot("fire_distance"), 0)

            smoke_scores = {"none": 0, "slightly_difficult": 15, "cant_breathe": 45}
            risk_score += smoke_scores.get(tracker.get_slot("smoke_inhalation"), 0)

            if tracker.get_slot("vehicle_access") == "no_vehicle":
                risk_score += 20

        elif crisis_type == "power_outage":
            temp_scores = {"normal": 0, "uncomfortable": 25, "dangerous": 35}
            risk_score += temp_scores.get(tracker.get_slot("heating_cooling_risk"), 0)

            floor_scores = {"ground_1st": 0, "2_4": 10, "5_plus": 15}
            risk_score += floor_scores.get(tracker.get_slot("building_floor"), 0)

            duration_scores = {"below_6hours": 5, "6h_24h": 15, "above_24h": 30}
            risk_score += duration_scores.get(tracker.get_slot("duration_estimate"), 0)

        return risk_score
    
    
    async def validate_crisis_type(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        
        current_crisis = tracker.get_slot("crisis_type")
        if current_crisis:
            return {"crisis_type": current_crisis}
        intent = tracker.latest_message.get('intent', {}).get('name')
        
        crisis_mapping = {
            'report_flood': 'flood',
            'report_wildfire': 'wildfire',
            'report_outage': 'power_outage'
        }
        
        crisis = crisis_mapping.get(intent)
        
        if crisis:
            return {"crisis_type": crisis}
        
        dispatcher.utter_message(response="utter_ask_crisis_type")
        return {"crisis_type": None}

    def _calculate_current_risk(self, tracker: Tracker) -> int:
        """Best-effort risk calculation using currently filled slots.

        This is used for early stop (>=70) while the form is still collecting data.
        Missing slots contribute 0.
        """
        risk_score = 0

        need_medical = tracker.get_slot("need_medical")
        medical_scores = {
            "none": 0,
            "medications": 25,
            "injured": 45,
            "critical": 70,
        }
        risk_score += medical_scores.get(need_medical, 0)

        person_count = tracker.get_slot("person_count")
        if person_count:
            try:
                count = int(str(person_count))
                if count == 1:
                    risk_score += 0
                elif count in [2, 3]:
                    risk_score += 10
                elif count in [4, 5, 6]:
                    risk_score += 15
                else:
                    risk_score += 20
            except Exception:
                pass

        if tracker.get_slot("vulnerable_group") == "yes":
            risk_score += 20

        if tracker.get_slot("mobility_needs") == "yes":
            risk_score += 10

        crisis_type = tracker.get_slot("crisis_type")
        if crisis_type == "flood":
            water_level = tracker.get_slot("water_level")
            risk_score += {
                "below_10cm": 5,
                "10cm_30cm": 15,
                "30cm_60cm": 30,
                "above_60cm": 45,
            }.get(water_level, 0)

            water_trend = tracker.get_slot("water_trend")
            risk_score += {
                "none": 0,
                "stable": 0,
                "slowly_rising": 15,
                "rising_fast": 25,
            }.get(water_trend, 0)

            floor_info = tracker.get_slot("floor_info")
            risk_score += {
                "basement": 25,
                "ground": 15,
                "upper_floor": 0,
            }.get(floor_info, 0)

            if tracker.get_slot("power_outage") == "yes":
                risk_score += 20
            hazard_type = tracker.get_slot("hazard_type")
            risk_score += {
                "none": 0,
                "gas_smell": 25,
                "electricity_risk": 25,
                "fire": 30,
            }.get(hazard_type, 0)

        elif crisis_type == "wildfire":
            fire_distance = tracker.get_slot("fire_distance")
            risk_score += {
                "none": 0,
                "visible": 10,
                "nearby": 20,
                "surrounding": 45,
            }.get(fire_distance, 0)

            smoke_inhalation = tracker.get_slot("smoke_inhalation")
            risk_score += {
                "none": 0,
                "slightly_difficult": 15,
                "cant_breathe": 45,
            }.get(smoke_inhalation, 0)

            if tracker.get_slot("vehicle_access") == "no_vehicle":
                risk_score += 20

        elif crisis_type == "power_outage":
            heating_cooling_risk = tracker.get_slot("heating_cooling_risk")
            risk_score += {
                "normal": 0,
                "uncomfortable": 25,
                "dangerous": 35,
            }.get(heating_cooling_risk, 0)

            building_floor = tracker.get_slot("building_floor")
            risk_score += {
                "ground_1st": 0,
                "2_4": 10,
                "5_plus": 15,
            }.get(building_floor, 0)

            duration_estimate = tracker.get_slot("duration_estimate")
            risk_score += {
                "below_6hours": 5,
                "6h_24h": 15,
                "above_24h": 30,
            }.get(duration_estimate, 0)

        return int(risk_score)

class ActionProvideWarnings(Action):
    """Provide official warnings"""

    def name(self) -> Text:
        return "action_provide_warnings"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        location = tracker.get_slot("location")
        if not location:
            dispatcher.utter_message(text="Please provide your city to check warnings.")
            return []

        city_candidates = _build_city_variants(location)
        city_label = _pick_display_city(city_candidates) if city_candidates else _clean_text(location)
        ars_code = _get_ars_code(str(location))

        header = "OFFICIAL WARNINGS"
        if city_label:
            header = f"{header} - {city_label}"

        if not ars_code:
            dispatcher.utter_message(
                text=f"{header}\n\nNo official warnings are available for this location."
            )
            return []

        dashboard_url = f"https://nina.api.proxy.bund.dev/api31/dashboard/{ars_code}.json"
        print(f"[Warnings] Dashboard URL: {dashboard_url}")
        dashboard = _fetch_json(dashboard_url)
        print(f"[Warnings] Dashboard result: {dashboard}")
        warning_id = _extract_warning_id(dashboard)
        if not warning_id:
            dispatcher.utter_message(
                text=f"{header}\n\nNo official warnings are available for this location."
            )
            return []

        warning_url = f"https://nina.api.proxy.bund.dev/api31/warnings/{warning_id}.json"
        print(f"[Warnings] Warning URL: {warning_url}")
        warning_payload = _fetch_json(warning_url)
        print(f"[Warnings] Warning result: {warning_payload}")
        info = _select_warning_info(warning_payload)
        if not info:
            dispatcher.utter_message(
                text=f"{header}\n\nNo detailed warning data is available right now."
            )
            return []

        severity = _clean_html_text(info.get("severity")) or "Unknown"
        headline = _clean_html_text(info.get("headline"))
        description = _clean_html_text(info.get("description"))
        instruction = _clean_html_text(info.get("instruction"))
        contact = _clean_html_text(info.get("contact"))

        lines = [header, f"Severity: {severity}"]
        if headline:
            lines.append(headline)
        if description:
            lines.extend(["", description])
        if instruction:
            lines.extend(["", f"Instructions: {instruction}"])
        if contact:
            lines.extend(["", f"Contact: {contact}"])

        dispatcher.utter_message(text="\n".join(lines).strip())
        return []


class ActionProvideEmergencyNumbers(Action):
    """Provide emergency numbers from the database"""

    def name(self) -> Text:
        return "action_provide_emergency_numbers"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        location = tracker.get_slot("location")

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT label, phone
                    FROM emergency_numbers
                    WHERE scope = 'national'
                    ORDER BY label
                    """
                )
                national = cur.fetchall()

                city_numbers = []
                city_label = None
                if location:
                    city_candidates = _build_city_variants(location)
                    for candidate in city_candidates:
                        cur.execute(
                            """
                            SELECT label, phone, city_name
                            FROM emergency_numbers
                            WHERE scope = 'city' AND lower(city_name) = lower(%s)
                            ORDER BY label
                            """,
                            (candidate,),
                        )
                        rows = cur.fetchall()
                        if rows:
                            city_numbers = [(row[0], row[1]) for row in rows]
                            city_label = rows[0][2] or _pick_display_city([candidate])
                            break

        if not national and not city_numbers:
            dispatcher.utter_message(text="EMERGENCY NUMBERS\n\nNo numbers are available.")
            return []

        lines = ["EMERGENCY NUMBERS", "", "National:"]
        for label, phone in national:
            lines.append(f"{label}: {phone}")

        if city_numbers and city_label:
            lines.extend(["", f"{city_label}:"])
            for label, phone in city_numbers:
                lines.append(f"{label}: {phone}")

        dispatcher.utter_message(text="\n".join(lines))

        return []


class ActionProvideForecast(Action):
    """Provide current weather information"""

    def name(self) -> Text:
        return "action_provide_forecast"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        location = tracker.get_slot("location")
        metadata = tracker.latest_message.get("metadata") or {}

        if not location:
            dispatcher.utter_message(text="Please provide your city to check the weather.")
            return []

        lat, lon = _extract_lat_lon(location, metadata)
        display_name = None

        if lat is None or lon is None:
            print("[Location] No coordinates provided. Using Nominatim lookup.")
            lat, lon, display_name = _geocode_city(str(location))
        else:
            print(f"[Location] Using provided coordinates: lat={lat}, lon={lon}")

        if lat is None or lon is None:
            dispatcher.utter_message(
                text="I could not determine the location coordinates. Please share the city name again."
            )
            return []

        params = {"lat": lat, "lon": lon}
        url = "https://api.brightsky.dev/current_weather?" + urllib.parse.urlencode(params)
        data = _fetch_json(url)
        print("[Forecast] BrightSky response:", data)

        if not data:
            dispatcher.utter_message(
                text="Weather data is not available right now. Please try again in a moment."
            )
            return []

        weather = None
        for key in ("weather", "current_weather", "current"):
            payload = data.get(key)
            if isinstance(payload, list) and payload:
                weather = payload[0]
                break
            if isinstance(payload, dict):
                weather = payload
                break

        if not weather:
            dispatcher.utter_message(
                text="Weather data is not available right now. Please try again in a moment."
            )
            return []

        temperature = weather.get("temperature")
        condition = weather.get("condition") or weather.get("summary")
        updated_raw = weather.get("timestamp") or weather.get("time")
        updated_at = None
        if isinstance(updated_raw, str):
            cleaned = updated_raw.replace("Z", "+00:00")
            try:
                parsed = datetime.fromisoformat(cleaned)
                time_12h = parsed.strftime("%I:%M %p").lstrip("0")
                updated_at = (
                    f"{parsed.strftime('%Y-%m-%d %H:%M')} "
                    f"({time_12h})"
                )
            except ValueError:
                updated_at = _format_timestamp(updated_raw)
        else:
            updated_at = _format_timestamp(updated_raw)

        name_label = display_name or str(location)
        header = "WEATHER FORECAST"
        lines = [header, f"Location: {name_label}", ""]
        if temperature is not None:
            lines.append(f"Temperature: {temperature} C")
        if condition:
            lines.append(f"Condition: {condition}")
        if updated_at:
            lines.append(f"Updated: {updated_at}")

        dispatcher.utter_message(text="\n".join(lines).strip())

        return []


class ActionProvideSupplyPoints(Action):
    """Provide supply points or contact points"""

    def name(self) -> Text:
        return "action_provide_supply_points"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        location = tracker.get_slot("location")
        supply_type = tracker.get_slot("supply_type")
        category = _normalize_supply_category(supply_type)
        intent = tracker.latest_message.get("intent", {}).get("name")
        if intent == "request_supply_points":
            category = None


        if not location:
            dispatcher.utter_message(text="Please provide your city to continue.")
            return []

        with get_connection() as conn:
            with conn.cursor() as cur:
                city_candidates = _build_city_variants(location)
                if not city_candidates:
                    dispatcher.utter_message(
                        text="I could not identify a city from that location. Please try again."
                    )
                    return []
                city_name = _pick_display_city(city_candidates) or location

                if category:
                    rows = []
                    for candidate in city_candidates:
                        cur.execute(
                            """
                            SELECT name, address, description, phone, city_name
                            FROM supply_points
                            WHERE lower(city_name) = lower(%s) AND category = %s
                            ORDER BY name
                            """,
                            (candidate, category),
                        )
                        rows = cur.fetchall()
                        if rows:
                            city_name = rows[0][4] or city_name
                            break

                    category_label = category.replace("_", " ").title()
                    header = f"SUPPLY POINTS ({category_label}) - {city_name}"
                    if not rows:
                        dispatcher.utter_message(
                            text=f"{header}\n\nNo supply points found for this category in {city_name}."
                        )
                        return [SlotSet("supply_type", None)]

                    lines = [header, "", "Available locations:"]
                    for idx, row in enumerate(rows, 1):
                        name, address, description, phone, _ = row
                        lines.append(f"{idx}. {name}")
                        lines.append(f"   Address: {address}")
                        if description:
                            lines.append(f"   Details: {description}")
                        if phone:
                            lines.append(f"   Phone: {phone}")
                        lines.append("")

                    dispatcher.utter_message(text="\n".join(lines).strip())
                    return [SlotSet("supply_type", None)]

                rows = []
                for candidate in city_candidates:
                    cur.execute(
                        """
                        SELECT name, address, description, phone, city_name
                        FROM contact_points
                        WHERE lower(city_name) = lower(%s)
                        ORDER BY name
                        """,
                        (candidate,),
                    )
                    rows = cur.fetchall()
                    if rows:
                        city_name = rows[0][4] or city_name
                        break

        if rows:
            header = f"CONTACT POINTS (LEUCHTTUERME) - {city_name}"
            lines = [header, "", "Available locations:"]
            for idx, row in enumerate(rows, 1):
                name, address, description, phone, _ = row
                lines.append(f"{idx}. {name}")
                lines.append(f"   Address: {address}")
                if description:
                    lines.append(f"   Details: {description}")
                if phone:
                    lines.append(f"   Phone: {phone}")
                lines.append("")

            dispatcher.utter_message(text="\n".join(lines).strip())
            return [SlotSet("supply_type", None)]

        header = f"CONTACT POINTS (LEUCHTTUERME) - {city_name}"
        dispatcher.utter_message(
            text=f"{header}\n\nNo contact points found for this city."
        )

        return [SlotSet("supply_type", None)]


class ActionProvideEvacuationInfo(Action):
    """Provide evacuation necessity information"""

    def name(self) -> Text:
        return "action_provide_evacuation_info"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        location = tracker.get_slot("location")
        metadata = tracker.latest_message.get("metadata") or {}

        if not location:
            dispatcher.utter_message(text="Please provide your city to check evacuation necessity.")
            return []

        lat, lon = _extract_lat_lon(location, metadata)
        display_name = None

        if lat is None or lon is None:
            print("[Location] No coordinates provided. Using Nominatim lookup.")
            lat, lon, display_name = _geocode_city(str(location))
        else:
            print(f"[Location] Using provided coordinates: lat={lat}, lon={lon}")

        if lat is None or lon is None:
            dispatcher.utter_message(
                text="I could not determine the location coordinates. Please share the city name again."
            )
            return []

        stations = _fetch_pegel_stations(lat, lon, radius_km=5)

        if not stations:
            risk_label = "Low"
            message = (
                f"EVACUATION NECESSITY: Risk {risk_label}\n"
                "Checked within ~5 km of the provided location using official data. "
                "For accuracy, refer to the HQ100 map for your area."
            )
            dispatcher.utter_message(text=message)
            return []

        selected_station = None
        selected_series = None
        selected_measurement = None
        high_station = None
        high_series = None
        high_measurement = None

        for station in stations:
            series, measurement = _extract_current_measurement(station)
            if measurement and not selected_station:
                selected_station = station
                selected_series = series
                selected_measurement = measurement

            state = (measurement or {}).get("stateMnwMhw")
            if state and "high" in str(state).lower():
                high_station = station
                high_series = series
                high_measurement = measurement
                break

        if high_station:
            selected_station = high_station
            selected_series = high_series
            selected_measurement = high_measurement

        risk_level = "LOW"

        if high_station:
            risk_level = "HIGH"
            station_lat = _parse_float(selected_station.get("latitude")) if selected_station else None
            station_lon = _parse_float(selected_station.get("longitude")) if selected_station else None
            if station_lat is not None and station_lon is not None:
                user_elev = _fetch_elevation(lat, lon)
                station_elev = _fetch_elevation(station_lat, station_lon)
                if user_elev is not None and station_elev is not None:
                    diff = user_elev - station_elev
                    if diff < 0:
                        pass
                    elif diff <= 5:
                        pass
                    else:
                        pass

        risk_label = "High🔴" if risk_level == "HIGH" else "Low"
        message = (
            f"EVACUATION NECESSITY: Risk {risk_label}\n"
            "Checked within ~5 km of the provided location using official data. "
            "For accuracy, refer to the HQ100 map for your area."
        )
        dispatcher.utter_message(text=message)

        return []


class ActionEscalateToOperator(Action):
    """Escalate to human operator with context"""

    def name(self) -> Text:
        return "action_escalate_to_operator"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        conversation_id = tracker.sender_id or "unknown"
        user_channel = tracker.get_latest_input_channel() or "unknown"
        risk_score = tracker.get_slot("risk_score")
        crisis_type = tracker.get_slot("crisis_type")
        user_status = tracker.get_slot("user_status")
        latest_text = (tracker.latest_message.get("text") or "").strip()
        summary_json = _build_handoff_summary(tracker)

        request_id = None
        system_message_id = None

        with get_connection() as conn:
            with conn.cursor() as cur:
                request_id = _get_active_handoff_request(cur, conversation_id)
                if request_id:
                    cur.execute(
                        """
                        UPDATE handoff_requests
                        SET risk_score = %s,
                            crisis_type = %s,
                            user_status = %s,
                            user_channel = %s,
                            summary_json = %s
                        WHERE id = %s
                        """,
                        (risk_score, crisis_type, user_status, user_channel, summary_json, request_id),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO handoff_requests
                          (conversation_id, status, risk_score, crisis_type, user_status,
                           user_channel, summary_json)
                        VALUES (%s, 'open', %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (conversation_id, risk_score, crisis_type, user_status, user_channel, summary_json),
                    )
                    request_id = cur.fetchone()[0]

                system_message_id = _insert_handoff_message(
                    cur,
                    request_id,
                    "system",
                    "Escalation created. Waiting for operator assignment.",
                )

        dispatcher.utter_message(
            text="Connecting you to a human operator now. Please keep this chat open."
        )

        return [ActiveLoop(None)]


class ActionDefaultFallback(Action):
    """Handle fallback with user status awareness"""
    
    def name(self) -> Text:
        return "action_default_fallback"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        user_status = tracker.get_slot("user_status")
        latest_text = (tracker.latest_message.get("text") or "").strip()
        
        if user_status == "safe":
            if latest_text:
                rag_answer = _rag_dspy_answer(latest_text)
                if rag_answer:
                    dispatcher.utter_message(text=rag_answer)
                    return []
            location = tracker.get_slot("location")
            if location:
                dispatcher.utter_message(response="utter_safe_menu_after_location")
                return []
            return [FollowupAction("safe_info_form")]
        
        elif user_status == "trapped_safe":
            if latest_text:
                rag_answer = _rag_dspy_answer(latest_text)
                if rag_answer:
                    dispatcher.utter_message(text=rag_answer)
                    return []
            message = "I didn't understand that. Would you like to:\n"
            message += "• Continue the assessment\n"
            message += "• Speak with an emergency operator"
            
            dispatcher.utter_message(
                text=message,
                buttons=[
                    {"title": "Continue Assessment", "payload": "/affirm"},
                    {"title": "Speak with Operator", "payload": "/request_operator"}
                ]
            )
        
        elif user_status == "emergency":
            return [FollowupAction("action_escalate_to_operator")]
        
        else:
            if latest_text:
                rag_answer = _rag_dspy_answer(latest_text)
                if rag_answer:
                    dispatcher.utter_message(text=rag_answer)
                    return []
            dispatcher.utter_message(response="utter_default_fallback")
        
        return []

class ActionHandleSafeLocation(Action):
    """Handle location input from safe users and show menu"""
    
    def name(self) -> Text:
        return "action_handle_safe_location"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        user_text = tracker.latest_message.get('text', '').strip()
        existing_location = tracker.get_slot("location")
        
        if existing_location:
            dispatcher.utter_message(response="utter_safe_menu_after_location")
            return []

        if user_text and len(user_text) > 2:
            dispatcher.utter_message(response="utter_safe_menu_after_location")
            return [SlotSet("location", user_text)]
        dispatcher.utter_message(response="utter_ask_location")
        return []


class ActionChangeLocation(Action):
    """Update location slot when user changes address."""

    def name(self) -> Text:
        return "action_change_location"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        location_text = None
        entities = tracker.latest_message.get("entities") or []
        for entity in entities:
            if entity.get("entity") == "location" and entity.get("value"):
                location_text = str(entity["value"]).strip()
                break

        if not location_text:
            metadata = tracker.latest_message.get("metadata") or {}
            meta_location = metadata.get("location") or {}
            if isinstance(meta_location, dict):
                location_text = meta_location.get("text")
            elif isinstance(meta_location, str):
                location_text = meta_location

        if not location_text:
            location_text = tracker.latest_message.get("text", "").strip()
            if location_text.startswith("/"):
                location_text = ""

        if not location_text:
            dispatcher.utter_message(response="utter_ask_location")
            return []

        dispatcher.utter_message(response="utter_location_updated")
        return [SlotSet("location", location_text)]


class ActionHandleGeneralInfo(Action):
    def name(self) -> Text:
        return "action_handle_general_info"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        latest_text = (tracker.latest_message.get("text") or "").strip()
        user_status = tracker.get_slot("user_status")
        if latest_text.startswith("/"):
            if user_status:
                dispatcher.utter_message(response="utter_ask_info_type")
            else:
                dispatcher.utter_message(response="utter_ask_user_status")
            return []
        rag_answer = _rag_dspy_answer(latest_text)
        if rag_answer:
            dispatcher.utter_message(text=rag_answer)
            return []
        if user_status:
            dispatcher.utter_message(response="utter_ask_info_type")
        else:
            dispatcher.utter_message(response="utter_ask_user_status")
        return []

