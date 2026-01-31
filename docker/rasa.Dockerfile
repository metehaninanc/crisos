FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
ENV RASA_MODEL=crisos_bert_model.tar.gz

WORKDIR /app

COPY requirements_rasa.txt /app/requirements_rasa.txt
RUN pip install --no-cache-dir -r /app/requirements_rasa.txt
RUN python -m spacy download en_core_web_md

COPY config_diet.yml /app/config_diet.yml
COPY config_bert.yml /app/config_bert.yml
COPY data /app/data
COPY domain /app/domain
COPY models /app/models
COPY endpoints.docker.yml /app/endpoints.docker.yml

EXPOSE 5005

CMD ["sh", "-c", "rasa run --enable-api --cors '*' --model /app/models/${RASA_MODEL} --endpoints /app/endpoints.docker.yml"]
