FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY db /app/db

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "backend/app.py"]
