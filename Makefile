# SentinelAI
PY := .venv/bin/python
DOCKER ?= docker
IMAGE := sentinelai:0.6.0
DOCS ?= docs
DEV_PORT ?= 8001
DEV_CHECK_MIN ?= 5
# 로컬 시험 환경 — 진짜 DB · 벡터 DB 대신 .dev/ 를 씁니다 (모델 서버 주소 등 나머지는 .env 그대로). 주기 점검은 DEV_CHECK_MIN 분마다.
DEV_ENV := SENTINELAI_DB_PATH=.dev/sentinelai.db SENTINELAI_RESULTS_DB_PATH=.dev/results.db SENTINELAI_MILVUS_URI=.dev/milvus.db SENTINELAI_MONITOR_INTERVAL_MIN=$(DEV_CHECK_MIN) DEV_PORT=$(DEV_PORT)
# 시험용 점검 대상 컨테이너 — 노드가 그 안에서 root 로 읽어 호스트의 make dev 로 보냅니다.
# host.containers.internal 을 호스트의 127.0.0.1 로 이어, make dev 를 바깥에 열지 않습니다. NET_ADMIN 이 있어야 ufw 가 실제로 켜집니다.
PODMAN ?= podman
TARGET_IMAGE := sentinel-target
TARGET_RUN := $(PODMAN) run -d --network pasta:--map-host-loopback,169.254.1.2 --cap-add NET_ADMIN --cap-add NET_RAW -e SERVER=http://host.containers.internal:$(DEV_PORT) -e INTERVAL=$(or $(INTERVAL),1)

.PHONY: dev-setup dev dev-node dev-sim dev-targets dev-targets-stop help install health index review-policies check-nodes monitor import-snapshots create-root review-check web docker-build docker-run clean

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
	@echo "--- 로컬 시험 환경 (.dev/, 진짜 DB 는 건드리지 않음) ---"
	@echo "dev-setup [RESET=1]            시험 계정(비밀번호 dev-pass-1234) · 연습용 노드 수집 · 이 컴퓨터용 노드 설정 만들기"
	@echo "dev [DEV_CHECK_MIN=5]          시험 환경으로 웹 실행 (http://127.0.0.1:$(DEV_PORT)), 서버 점검 5분마다"
	@echo "--- 노드 수집 시험 (make dev 가 떠 있을 때) ---"
	@echo "dev-sim [NODES=3] [ROUNDS=3] [EVERY=5]  흉내 노드가 설정을 조금씩 바꿔 가며 보냄 (컨테이너 없이)"
	@echo "dev-targets [INTERVAL=1]       점검 대상 컨테이너 2대(weak · strict)를 띄워 진짜 노드가 root 로 수집해 보냄 (podman)"
	@echo "dev-targets-stop               위 컨테이너 지우기"
	@echo "dev-node                       이 컴퓨터를 노드로 한 번 보내기 (root 가 아니면 SSH · sudo 는 확인 못함)"
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

dev-setup:
	$(DEV_ENV) $(if $(RESET),RESET=1) $(PY) scripts/dev_setup.py

dev:
	@test -d .dev || (echo "먼저 make dev-setup" && exit 1)
	$(DEV_ENV) $(PY) -m uvicorn sentinelai.web.main:app --reload --port $(DEV_PORT)

dev-node:
	cd node && python3 -m sentinel_node once -c ../.dev/node.conf

dev-sim:
	$(DEV_ENV) $(PY) scripts/dev_nodes.py sim -n $(or $(NODES),3) -r $(or $(ROUNDS),3) -e $(or $(EVERY),5)

dev-targets:
	@test -d .dev || (echo "먼저 make dev-setup" && exit 1)
	cd node && $(PODMAN) build -q -t $(TARGET_IMAGE) -f testenv/Containerfile . >/dev/null
	@for p in weak strict; do \
		$(PODMAN) rm -f sentinel-target-$$p >/dev/null 2>&1; \
		$(TARGET_RUN) --name sentinel-target-$$p --hostname target-$$p -e PROFILE=$$p \
			-e KEY=$$($(DEV_ENV) $(PY) scripts/dev_nodes.py key target-$$p) $(TARGET_IMAGE) >/dev/null && echo "target-$$p 실행 — 기록: $(PODMAN) logs -f sentinel-target-$$p"; \
	done

dev-targets-stop:
	$(PODMAN) rm -f sentinel-target-weak sentinel-target-strict

docker-build:
	$(DOCKER) build -t $(IMAGE) .

docker-run:
	$(DOCKER) run --rm --env-file .env $(IMAGE) health

clean:
	rm -rf .venv .index
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
