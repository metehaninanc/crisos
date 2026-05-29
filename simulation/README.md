# CRISOS Simulation Framework

This folder provides a controlled simulation setup to generate interaction logs for analytics work.

## Files

- `test_scenarios.csv`: scenario-driven test utterances with true labels
- `run_simulation.py`: sends scenarios to CRISOS API and writes `simulated_logs.csv`
- `simulated_logs.csv`: output file generated after simulation

## Input Schema (`test_scenarios.csv`)

- `scenario_id`
- `user_id`
- `session_id`
- `turn_id`
- `user_message`
- `true_intent`
- `expected_task`
- `channel`

## Output Schema (`simulated_logs.csv`)

- `scenario_id`
- `turn_id`
- `conversation_id`
- `user_id`
- `session_id`
- `timestamp`
- `channel`
- `user_message`
- `true_intent`
- `predicted_intent`
- `confidence_score`
- `bot_response`
- `fallback_triggered`
- `handover_triggered`
- `rag_attempted`
- `rag_answered`
- `rag_no_answer`
- `response_time_seconds`
- `task_completed`
- `sentiment_score`
- `frustration_flag`
- `error`

## Run Steps

1. Start CRISOS backend (and Rasa) so chat endpoint is available at:
   - `http://localhost:8000/api/message`
2. Run simulation:

```bash
python simulation/run_simulation.py
```

3. Optional flags:

```bash
python simulation/run_simulation.py --api-url http://localhost:8000/api/message --input simulation/test_scenarios.csv --output simulation/simulated_logs.csv
```

4. Open `simulation/simulated_logs.csv` for Colab analytics.

## Notes

- Script sends `sender_id`, `user_id`, `session_id`, `message`, `true_intent`, and `channel`.
- Script normalizes scenario `true_intent` aliases to CRISOS Rasa intent names before sending.
- If backend logger (`logs/crisos_interaction_logs.csv`) exists, script enriches `predicted_intent`, `confidence_score`, fallback, handover, and frustration from that log.
- API failures are captured in `error` and do not stop the entire run.
