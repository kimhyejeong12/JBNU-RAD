# SentinelAI — 웹 · 엔진 · 데이터 계층 · CLI. `docker compose up`(compose.yaml)이 PostgreSQL 과 함께 띄웁니다.
# Ollama 는 이 이미지에 없고 SENTINELAI_OLLAMA_BASE_URL 로 가리킵니다.
# 설정값은 코드에 없습니다. .env.example 을 컨테이너 기본 .env 로 넣고, compose 가 .env 값을 환경변수로 덮어씁니다.
# 화면은 빌드 결과(sentinelai/web/static)가 커밋돼 있어 Node 가 필요 없습니다.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY .env.example ./.env
COPY sentinelai ./sentinelai
# 기준 문서는 compose 의 볼륨이 처음 만들어질 때 이 내용으로 채워집니다. 그 뒤로는 화면에서 올리고 고친 것이 볼륨에 남습니다.
COPY docs ./docs

# 벡터 DB(.milvus) · 기준 문서를 컨테이너 안에서 쓸 수 있게 쓰기 권한을 줍니다.
RUN useradd --create-home --uid 10001 sentinelai && mkdir -p .milvus data && chown -R sentinelai:sentinelai /app
USER sentinelai

EXPOSE 8000
# CLI 는 `./sentinel 명령` (= docker compose exec app python -m sentinelai 명령) 으로 부릅니다.
CMD ["python", "-m", "uvicorn", "sentinelai.web.main:app", "--host", "0.0.0.0", "--port", "8000"]
