import argparse
import csv
import json
import time
from pathlib import Path
from typing import Dict, List, Optional

import requests

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SCENARIOS_PATH = BASE_DIR / "test_scenarios.csv"
DEFAULT_OUTPUT_PATH = BASE_DIR / "simulated_logs.csv"
DEFAULT_BACKEND_LOG_PATH = BASE_DIR.parent / "logs" / "crisos_interaction_logs.csv"
DEFAULT_API_URL = "http://localhost:8000/api/message"

OUTPUT_HEADERS = [
    "scenario_id",
    "turn_id",
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

INTENT_ALIASES = {
    "ask_safe_point": "request_supply_points",
    "ask_emergency_numbers": "request_emergency_numbers",
    "ask_supply_points": "request_supply_points",
    "ask_weather_warning": "request_warnings",
    "ask_evacuation_necessity": "request_evacuation_info",
    "share_location": "change_location",
    "ask_contact_point": "request_general_info",
    "ambiguous_input": "nlu_fallback",
    "ask_rag_preparedness": "request_general_info",
    "out_of_domain": "out_of_scope",
    "gratitude": "thank",
    "smalltalk": "greet",
    "data_privacy_question": "request_general_info",
    "need_medical_help": "report_emergency",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run controlled CRISOS chatbot simulation.")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="CRISOS chat API endpoint.")
    parser.add_argument("--input", default=str(DEFAULT_SCENARIOS_PATH), help="Scenario CSV path.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_PATH), help="Output CSV path.")
    parser.add_argument(
        "--backend-log",
        default=str(DEFAULT_BACKEND_LOG_PATH),
        help="Backend interaction log CSV path for enriching predicted fields.",
    )
    parser.add_argument("--timeout", type=float, default=30.0, help="Request timeout in seconds.")
    return parser.parse_args()


def read_csv(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def read_backend_logs(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def find_latest_backend_match(
    backend_rows: List[Dict[str, str]],
    conversation_id: str,
    user_message: str,
) -> Optional[Dict[str, str]]:
    for row in reversed(backend_rows):
        if (
            (row.get("conversation_id") or "") == conversation_id
            and (row.get("user_message") or "") == user_message
        ):
            return row
    return None


def response_to_text(messages: List[Dict]) -> str:
    texts = []
    for message in messages:
        text = (message or {}).get("text")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
    return " ".join(texts)


def detect_fallback_from_text(bot_text: str) -> bool:
    lowered = bot_text.lower()
    hints = [
        "i didn't understand",
        "did not understand",
        "rephrase",
        "could you clarify",
        "default fallback",
    ]
    return any(hint in lowered for hint in hints)


def detect_handover_from_text(bot_text: str) -> bool:
    lowered = bot_text.lower()
    hints = [
        "human operator",
        "speak with operator",
        "connecting you to a human",
        "waiting for operator",
        "escalation",
    ]
    return any(hint in lowered for hint in hints)


def normalize_intent(intent: str) -> str:
    key = (intent or "").strip()
    return INTENT_ALIASES.get(key, key)


def detect_rag_no_answer(bot_text: str) -> bool:
    lowered = bot_text.lower()
    return "this question is not answered in the official documents we have." in lowered


def write_output(path: Path, rows: List[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_HEADERS)
        writer.writeheader()
        writer.writerows(rows)


def run() -> None:
    args = parse_args()
    scenarios_path = Path(args.input)
    output_path = Path(args.output)
    backend_log_path = Path(args.backend_log)

    scenarios = read_csv(scenarios_path)
    results: List[Dict[str, str]] = []

    for row in scenarios:
        scenario_id = (row.get("scenario_id") or "").strip()
        user_id = (row.get("user_id") or "").strip()
        session_id = (row.get("session_id") or "").strip()
        conversation_id = session_id or user_id or f"conv_{scenario_id}"
        turn_id = (row.get("turn_id") or "").strip()
        channel = (row.get("channel") or "web").strip()
        user_message = (row.get("user_message") or "").strip()
        true_intent = normalize_intent((row.get("true_intent") or "").strip())
        expected_task = (row.get("expected_task") or "").strip().lower()

        request_payload = {
            "sender_id": conversation_id,
            "user_id": user_id or conversation_id,
            "session_id": session_id or conversation_id,
            "channel": channel,
            "message": user_message,
            "true_intent": true_intent,
        }

        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        bot_response = ""
        predicted_intent = ""
        confidence_score = ""
        fallback_triggered = ""
        handover_triggered = ""
        rag_attempted = ""
        rag_answered = ""
        rag_no_answer = ""
        task_completed = "true" if expected_task in {"info", "action", "handover"} else ""
        sentiment_score = ""
        frustration_flag = ""
        error = ""

        start = time.perf_counter()
        try:
            response = requests.post(args.api_url, json=request_payload, timeout=args.timeout)
            elapsed = time.perf_counter() - start
            if response.ok:
                payload = response.json()
                messages = payload.get("messages", []) if isinstance(payload, dict) else []
                if not isinstance(messages, list):
                    messages = []
                bot_response = response_to_text(messages)
                fallback_triggered = str(detect_fallback_from_text(bot_response)).lower()
                handover_triggered = str(detect_handover_from_text(bot_response)).lower()
                rag_attempted = fallback_triggered
                rag_no_answer = str(detect_rag_no_answer(bot_response)).lower() if fallback_triggered == "true" else "false"
                rag_answered = (
                    "true"
                    if fallback_triggered == "true" and rag_no_answer == "false" and bool(bot_response.strip())
                    else "false"
                )
                frustration_hints = ("again", "already told you", "not helping", "useless", "angry", "help now")
                frustration_flag = str(any(h in user_message.lower() for h in frustration_hints)).lower()
            else:
                error = f"HTTP {response.status_code}: {response.text.strip()}"
            response_time = f"{elapsed:.6f}"
        except requests.RequestException as exc:
            elapsed = time.perf_counter() - start
            response_time = f"{elapsed:.6f}"
            error = str(exc)

        backend_rows = read_backend_logs(backend_log_path)
        backend_match = find_latest_backend_match(backend_rows, conversation_id, user_message)
        if backend_match:
            predicted_intent = backend_match.get("predicted_intent", "") or predicted_intent
            confidence_score = backend_match.get("confidence_score", "") or confidence_score
            fallback_triggered = backend_match.get("fallback_triggered", "") or fallback_triggered
            handover_triggered = backend_match.get("handover_triggered", "") or handover_triggered
            rag_attempted = backend_match.get("rag_attempted", "") or rag_attempted
            rag_answered = backend_match.get("rag_answered", "") or rag_answered
            rag_no_answer = backend_match.get("rag_no_answer", "") or rag_no_answer
            sentiment_score = backend_match.get("sentiment_score", "") or sentiment_score
            frustration_flag = backend_match.get("frustration_flag", "") or frustration_flag
            if not error:
                error = backend_match.get("error", "") or ""

        results.append(
            {
                "scenario_id": scenario_id,
                "turn_id": turn_id,
                "conversation_id": conversation_id,
                "user_id": user_id or conversation_id,
                "session_id": session_id or conversation_id,
                "timestamp": timestamp,
                "channel": channel,
                "user_message": user_message,
                "true_intent": true_intent,
                "predicted_intent": predicted_intent,
                "confidence_score": confidence_score,
                "bot_response": bot_response,
                "fallback_triggered": fallback_triggered,
                "handover_triggered": handover_triggered,
                "rag_attempted": rag_attempted,
                "rag_answered": rag_answered,
                "rag_no_answer": rag_no_answer,
                "response_time_seconds": response_time,
                "task_completed": task_completed,
                "sentiment_score": sentiment_score,
                "frustration_flag": frustration_flag,
                "error": error,
            }
        )

        print(f"[{scenario_id} turn {turn_id}] done | error={bool(error)}")

    write_output(output_path, results)
    print(f"Simulation complete. Wrote {len(results)} rows to: {output_path}")
    print("Tip: Use simulation/simulated_logs.csv in Colab for analytics tasks.")


if __name__ == "__main__":
    run()
