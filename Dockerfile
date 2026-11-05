# SentinelAI 웹 · 엔진 · CLI — 화면은 커밋된 빌드를 쓰므로 Node 가 없습니다. Ollama 는 따로 둡니다.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 기본 설정이고, compose 가 .env 값을 환경변수로 덮어씁니다.
COPY .env.example ./.env
COPY sentinelai ./sentinelai
# 기준 문서 볼륨이 처음 만들어질 때 이 내용으로 채워집니다.
COPY docs ./docs

RUN useradd --create-home --uid 10001 sentinelai && mkdir -p .milvus data && chown -R sentinelai:sentinelai /app
USER sentinelai

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "sentinelai.web.main:app", "--host", "0.0.0.0", "--port", "8000"]
