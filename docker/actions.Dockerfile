FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements_rasa.txt /app/requirements_rasa.txt
COPY requirements_rag.txt /app/requirements_rag.txt
RUN pip install --no-cache-dir -r /app/requirements_rasa.txt -r /app/requirements_rag.txt

COPY actions /app/actions
COPY rag_sources /app/rag_sources
COPY db /app/db

ENV PYTHONPATH=/app
EXPOSE 5055

CMD ["rasa", "run", "actions", "--actions", "actions", "--port", "5055"]
