# SentinelAI
PY := .venv/bin/python
DOCKER ?= docker
IMAGE := sentinelai:0.6.0
DOCS ?= docs

.PHONY: help install health index review-policies check-nodes monitor import-snapshots create-root review-check web docker-build docker-run clean

help:
	@echo "install                        venv 생성 + 의존성 설치 + .env 준비"
	@echo "web                            대시보드 (http://localhost:8000) — 로그 감시 · 서버 점검은 웹이 스스로 돌림"
	@echo "health                         Ollama · 모델 · 벡터 DB 확인"
	@echo "create-root LOGIN=아이디 NAME=이름 [DEPT=부서]  초기 루트 계정(보안 총책임자) — 비밀번호는 입력받음"
	@echo "import-snapshots DIR=폴더 NODE=이름  망이 막힌 노드가 export 한 수집 파일 넣기 (웹이 떠 있어도 됨)"
	@echo "--- 아래는 웹이 꺼져 있을 때만 (Milvus Lite 는 한 프로세스만 엶) ---"
	@echo "index [DOCS=경로] [REBUILD=1]   기준 문서 적재 (기본 docs, 바뀐 파일만)"
	@echo "review-policies                정책 관리 검토 — 문서 · 솔루션 정책 적재 + 정책 간 검토"
	@echo "check-nodes                    서버 점검 — 새 수집이 온 노드만"
	@echo "monitor [SINCE=시각] [FULL=1]   로그 감시 — 지난 감시 이후 로그만 (cron 용)"
	@echo "review-check [N=회수]           review_chain 반복 루프 · 등급 흔들림 재현"
	@echo "docker-build · docker-run · clean"

install:
	python3 -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt
	@test -f .env || (cp .env.example .env && echo ".env 생성됨")

health:
	$(PY) -m sentinelai health

index:
	$(PY) -m sentinelai index $(DOCS) $(if $(REBUILD),--rebuild)

review-policies:
	$(PY) -m sentinelai review-policies

check-nodes:
	$(PY) -m sentinelai check-nodes

monitor:
	$(PY) -m sentinelai monitor $(if $(SINCE),--since "$(SINCE)") $(if $(FULL),--full)

import-snapshots:
	$(PY) -m sentinelai import-snapshots "$(DIR)" $(if $(NODE),--node "$(NODE)")

create-root:
	$(PY) -m sentinelai create-root --login "$(LOGIN)" --name "$(NAME)" $(if $(DEPT),--department "$(DEPT)")

review-check:
	$(PY) scripts/review_check.py -n $(or $(N),3)

web:
	$(PY) -m uvicorn sentinelai.web.main:app --reload --port 8000

docker-build:
	$(DOCKER) build -t $(IMAGE) .

docker-run:
	$(DOCKER) run --rm --env-file .env $(IMAGE) health

clean:
	rm -rf .venv .index
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
