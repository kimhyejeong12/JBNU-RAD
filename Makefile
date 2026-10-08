# SentinelAI — 전북대학교 RAD(RAG & Decision) · SK쉴더스
PY := .venv/bin/python
DOCKER ?= docker
IMAGE := sentinelai:0.6.0
DOCS ?= docs

.PHONY: help install health models config index index-policies search ask chat review-check review-requests review-policies monitor web docker-build docker-run clean

help:
	@echo "install         venv 생성 + 의존성 설치 + .env 준비"
	@echo "health          서버·모델·인덱스 상태 확인"
	@echo "models          서버 모델 목록"
	@echo "config          현재 설정 출력"
	@echo "index [DOCS=경로] 문서로 벡터 인덱스 생성 (기본: docs)"
	@echo "index-policies [SRC=파일]  솔루션 정책 규칙을 인덱스에 적재 (기본: .env)"
	@echo "search Q=\"질의\"   인덱스 검색만"
	@echo "ask Q=\"질문\"      인덱스를 근거로 질의응답 (RAG)"
	@echo "chat Q=\"질문\"     모델에 직접 질의"
	@echo "review-check    review_chain 반복 루프·등급 흔들림 재현 (N=회수)"
	@echo "review-requests [SRC=파일]  권한 신청 전 건 판정 (정책 이해)"
	@echo "review-policies [SRC=파일]  정책 간 중복 · 충돌 · 과도한 허용 판정 (정책 이해)"
	@echo "monitor [SRC=로그] [SINCE=시각] [FULL=1]  지난 감시 이후 로그를 정책과 비교 (로그 감시)"
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
	$(PY) -m sentinelai index-policies $(SRC)

search:
	$(PY) -m sentinelai search "$(Q)"

ask:
	$(PY) -m sentinelai ask "$(Q)"

chat:
	$(PY) -m sentinelai chat "$(Q)"

review-check:
	$(PY) scripts/review_check.py -n $(or $(N),3)

monitor:
	$(PY) -m sentinelai monitor $(if $(SRC),"$(SRC)") $(if $(SINCE),--since "$(SINCE)") $(if $(FULL),--full)

review-requests:
	$(PY) -m sentinelai review-requests $(SRC)

review-policies:
	$(PY) -m sentinelai review-policies $(SRC)

web:
	$(PY) -m uvicorn sentinelai.web.main:app --reload --port 8000

docker-build:
	$(DOCKER) build -t $(IMAGE) .

docker-run:
	$(DOCKER) run --rm --env-file .env $(IMAGE) health

clean:
	rm -rf .venv .index
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
