import csv
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

CSV_HEADERS = [
    "conversation_id",
    "user_id",
    "session_id",
    "timestamp",
    "channel",
    "user_message",
    "true_intent",
    "predicted_intent",
    "confidence_score",
    "bot_response",
    "fallback_triggered",
    "handover_triggered",
    "rag_attempted",
    "rag_answered",
    "rag_no_answer",
    "response_time_seconds",
    "task_completed",
    "sentiment_score",
    "frustration_flag",
    "error",
]

FALLBACK_HINTS = (
    "i didn't understand",
    "did not understand",
    "utter_default_fallback",
    "could you rephrase",
)
RAG_NO_ANSWER_HINT = (
    "this question is not answered in the official documents we have."
)
HANDOVER_HINTS = (
    "human operator",
    "speak with operator",
    "connecting you to a human operator",
    "waiting for operator assignment",
    "escalation created",
)
FRUSTRATION_HINTS = (
    "again",
    "already told you",
    "not helping",
    "useless",
    "angry",
    "help now",
)

_LOCK = threading.Lock()
_FALLBACK_COUNTS: Dict[str, int] = {}
_LOGS_DIR = Path(__file__).resolve().parents[2] / "logs"
_CSV_PATH = _LOGS_DIR / "crisos_interaction_logs.csv"


def _normalize_text(value: Optional[str]) -> str:
    return (value or "").strip()


def _contains_any(text: str, hints: Tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(hint in lowered for hint in hints)


def _format_confidence(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.6f}"


def _format_seconds(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.6f}"


def _ensure_csv_ready() -> None:
    _LOGS_DIR.mkdir(parents=True, exist_ok=True)
    if not _CSV_PATH.exists():
        with _CSV_PATH.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
            writer.writeheader()
        return
    with _CSV_PATH.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        existing_headers = reader.fieldnames or []
        if existing_headers == CSV_HEADERS:
            return
        existing_rows = list(reader)
    with _CSV_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
        writer.writeheader()
        for row in existing_rows:
            upgraded = {header: row.get(header, "") for header in CSV_HEADERS}
            writer.writerow(upgraded)


def _get_fallback_repeat_flag(session_id: str, fallback_triggered: bool) -> bool:
    if not session_id:
        return False
    previous = _FALLBACK_COUNTS.get(session_id, 0)
    if fallback_triggered:
        _FALLBACK_COUNTS[session_id] = previous + 1
        return previous >= 1
    _FALLBACK_COUNTS[session_id] = 0
    return False


def detect_fallback_triggered(
    predicted_intent: Optional[str],
    confidence_score: Optional[float],
    bot_messages: List[dict],
    fallback_confidence_threshold: float,
) -> bool:
    intent_name = _normalize_text(predicted_intent).lower()
    if "fallback" in intent_name:
        return True
    if confidence_score is not None and confidence_score < fallback_confidence_threshold:
        return True
    response_text = " ".join(
        _normalize_text(message.get("text")) for message in bot_messages if isinstance(message, dict)
    )
    return _contains_any(response_text, FALLBACK_HINTS)


def detect_handover_triggered(bot_messages: List[dict]) -> bool:
    response_text = " ".join(
        _normalize_text(message.get("text")) for message in bot_messages if isinstance(message, dict)
    )
    if _contains_any(response_text, HANDOVER_HINTS):
        return True
    for message in bot_messages:
        if not isinstance(message, dict):
            continue
        buttons = message.get("buttons")
        if not isinstance(buttons, list):
            continue
        for button in buttons:
            if not isinstance(button, dict):
                continue
            payload = _normalize_text(str(button.get("payload") or "")).lower()
            if "/request_operator" in payload:
                return True
    return False


def append_interaction_log(
    *,
    conversation_id: str,
    user_id: Optional[str],
    session_id: Optional[str],
    channel: Optional[str],
    user_message: str,
    true_intent: Optional[str],
    predicted_intent: Optional[str],
    confidence_score: Optional[float],
    bot_messages: List[dict],
    fallback_triggered: bool,
    handover_triggered: bool,
    response_time_seconds: Optional[float],
    task_completed: Optional[bool] = None,
    sentiment_score: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    combined_bot_response = " ".join(
        _normalize_text(message.get("text")) for message in bot_messages if isinstance(message, dict)
    ).strip()
    normalized_session = _normalize_text(session_id) or _normalize_text(conversation_id)
    user_text = _normalize_text(user_message)
    frustration_by_text = _contains_any(user_text, FRUSTRATION_HINTS)
    rag_attempted = bool(fallback_triggered)
    rag_no_answer = rag_attempted and RAG_NO_ANSWER_HINT in combined_bot_response.lower()
    rag_answered = rag_attempted and bool(combined_bot_response) and not rag_no_answer

    with _LOCK:
        _ensure_csv_ready()
        repeated_fallback = _get_fallback_repeat_flag(normalized_session, fallback_triggered)
        frustration_flag = frustration_by_text or repeated_fallback
        row = {
            "conversation_id": _normalize_text(conversation_id),
            "user_id": _normalize_text(user_id) or _normalize_text(conversation_id),
            "session_id": normalized_session,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "channel": _normalize_text(channel) or "web",
            "user_message": user_text,
            "true_intent": _normalize_text(true_intent),
            "predicted_intent": _normalize_text(predicted_intent),
            "confidence_score": _format_confidence(confidence_score),
            "bot_response": combined_bot_response,
            "fallback_triggered": str(bool(fallback_triggered)).lower(),
            "handover_triggered": str(bool(handover_triggered)).lower(),
            "rag_attempted": str(bool(rag_attempted)).lower(),
            "rag_answered": str(bool(rag_answered)).lower(),
            "rag_no_answer": str(bool(rag_no_answer)).lower(),
            "response_time_seconds": _format_seconds(response_time_seconds),
            "task_completed": "" if task_completed is None else str(bool(task_completed)).lower(),
            "sentiment_score": _normalize_text(sentiment_score),
            "frustration_flag": str(bool(frustration_flag)).lower(),
            "error": _normalize_text(error),
        }
        with _CSV_PATH.open("a", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
            writer.writerow(row)
