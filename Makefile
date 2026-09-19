# RAD-LMENGINE LLM 코어
PY := .venv/bin/python
DOCKER ?= docker
IMAGE := rad-lmengine:0.6.0
DOCS ?= docs

.PHONY: help install health models config index search ask chat docker-build docker-run clean

help:
	@echo "install         venv 생성 + 의존성 설치 + .env 준비"
	@echo "health          서버·모델·인덱스 상태 확인"
	@echo "models          서버 모델 목록"
	@echo "config          현재 설정 출력"
	@echo "index [DOCS=경로] 문서로 벡터 인덱스 생성 (기본: docs)"
	@echo "search Q=\"질의\"   인덱스 검색만"
	@echo "ask Q=\"질문\"      인덱스를 근거로 질의응답 (RAG)"
	@echo "chat Q=\"질문\"     모델에 직접 질의"
	@echo "docker-build    이미지 빌드 (podman: make docker-build DOCKER=podman)"
	@echo "docker-run      컨테이너에서 health 실행"
	@echo "clean           venv·캐시·인덱스 정리"

install:
	python3 -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt
	@test -f .env || (cp .env.example .env && echo ".env 생성됨")

health:
	$(PY) -m rad_lmengine.cli health

models:
	$(PY) -m rad_lmengine.cli models

config:
	$(PY) -m rad_lmengine.cli config

index:
	$(PY) -m rad_lmengine.cli index $(DOCS)

search:
	$(PY) -m rad_lmengine.cli search "$(Q)"

ask:
	$(PY) -m rad_lmengine.cli ask "$(Q)"

chat:
	$(PY) -m rad_lmengine.cli chat "$(Q)"

docker-build:
	$(DOCKER) build -t $(IMAGE) .

docker-run:
	$(DOCKER) run --rm --env-file .env $(IMAGE) health

clean:
	rm -rf .venv .index
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
