# SentinelAI — 전북대학교 RAD(RAG & Decision) · SK쉴더스
PY := .venv/bin/python
DOCKER ?= docker
IMAGE := sentinelai:0.6.0
DOCS ?= docs

.PHONY: help install health models config index index-policies search ask chat review-check monitor precompute precompute-ask web docker-build docker-run clean

help:
	@echo "install         venv 생성 + 의존성 설치 + .env 준비"
	@echo "health          서버·모델·인덱스 상태 확인"
	@echo "models          서버 모델 목록"
	@echo "config          현재 설정 출력"
	@echo "index [DOCS=경로] 문서로 벡터 인덱스 생성 (기본: docs)"
	@echo "index-policies SRC=정책파일  솔루션 정책 규칙을 인덱스에 적재"
	@echo "search Q=\"질의\"   인덱스 검색만"
	@echo "ask Q=\"질문\"      인덱스를 근거로 질의응답 (RAG)"
	@echo "chat Q=\"질문\"     모델에 직접 질의"
	@echo "review-check    review_chain 반복 루프·등급 흔들림 재현 (N=회수)"
	@echo "monitor SRC=로그 [SINCE=시각] [STATE=파일]  로그를 정책과 비교해 사용자별로 판정"
	@echo "precompute      판정 결과를 data/results.json 에 미리 계산"
	@echo "precompute-ask  권한 질의 예시 답변을 data/ask_results.json 에 미리 계산"
	@echo "web             대시보드 실행 (http://localhost:8000)"
	@echo "docker-build    이미지 빌드 (podman: make docker-build DOCKER=podman)"
	@echo "docker-run      컨테이너에서 health 실행"
	@echo "clean           venv·캐시·인덱스 정리"

install:
	python3 -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt
	@test -f .env || (cp .env.example .env && echo ".env 생성됨")

health:
	$(PY) -m sentinelai health

models:
	$(PY) -m sentinelai models

config:
	$(PY) -m sentinelai config

index:
	$(PY) -m sentinelai index $(DOCS)

index-policies:
	$(PY) -m sentinelai index-policies "$(or $(SRC),data/policies.csv)"

search:
	$(PY) -m sentinelai search "$(Q)"

ask:
	$(PY) -m sentinelai ask "$(Q)"

chat:
	$(PY) -m sentinelai chat "$(Q)"

review-check:
	$(PY) scripts/review_check.py -n $(or $(N),3)

monitor:
	$(PY) -m sentinelai monitor "$(SRC)" $(if $(SINCE),--since "$(SINCE)") $(if $(STATE),--state "$(STATE)")

precompute:
	$(PY) scripts/precompute.py

precompute-ask:
	$(PY) scripts/precompute_ask.py

web:
	$(PY) -m uvicorn sentinelai.web.main:app --reload --port 8000

docker-build:
	$(DOCKER) build -t $(IMAGE) .

docker-run:
	$(DOCKER) run --rm --env-file .env $(IMAGE) health

clean:
	rm -rf .venv .index
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
