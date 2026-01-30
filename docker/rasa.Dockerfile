FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
ENV RASA_MODEL=crisos_diet_model.tar.gz

WORKDIR /app

COPY requirements_rasa.txt /app/requirements_rasa.txt
RUN pip install --no-cache-dir -r /app/requirements_rasa.txt
RUN pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_md-3.8.0/en_core_web_md-3.8.0-py3-none-any.whl

COPY config_diet.yml /app/config_diet.yml
COPY data /app/data
COPY domain /app/domain
COPY models /app/models/
COPY endpoints.docker.yml /app/endpoints.docker.yml

EXPOSE 5005

CMD ["sh", "-c", "rasa run --enable-api --cors '*' --model /app/models/${RASA_MODEL} --endpoints /app/endpoints.docker.yml"]
