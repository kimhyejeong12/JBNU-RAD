# SentinelAI 코어 (전북대학교 RAD · SK쉴더스) — 엔진 · 데이터 계층 · 실행 흐름. 웹은 넣지 않습니다.
# Ollama 는 이 이미지에 없고 SENTINELAI_OLLAMA_BASE_URL 로 가리킵니다.
# 설정값은 코드에 없습니다. .env.example 을 컨테이너 기본 .env 로 넣고,
# 실행할 때 --env-file 이나 -e 로 덮어씁니다.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY .env.example ./.env
# sentinelai/web 은 .dockerignore 로 뺍니다.
COPY sentinelai ./sentinelai

# 인덱스를 컨테이너 안에서 만들 수 있게 쓰기 권한을 줍니다.
RUN useradd --create-home --uid 10001 sentinelai && chown -R sentinelai:sentinelai /app
USER sentinelai

ENTRYPOINT ["python", "-m", "sentinelai"]
CMD ["health"]
