# SentinelAI 수집 노드

- 점검 대상 서버에서 도는 데몬
- 정해진 간격마다 보안 모듈 상태를 **읽기만** 해서 SentinelAI 서버로 보냄
- SentinelAI는 키로 노드를 찾아 노드별로 쌓고, 새 수집이 온 노드를 주기적으로 기준 문서와 비교해 정책 관리 화면의 서버 점검에 올림

| 모듈 | 읽는 것 |
|---|---|
| `ufw` | `ufw status verbose` |
| `sshd` | `sshd -T` (root 필요) |
| `pam` | `/etc/pam.d/{common-auth, common-password, system-auth, password-auth, sshd, su, sudo}` · `faillock.conf` · `pwquality.conf` |
| `accounts` | UID 0 계정 · sudo/wheel/admin 그룹 · `/etc/sudoers` · `/etc/sudoers.d/*` (root 필요) |

- 원문을 그대로 보냄. 무엇을 뽑아 판정할지는 서버(`sentinelai/data/collected.py`)가 정함

## 설치

- 필요: Python 3.8 이상 (표준 라이브러리만), systemd, root

1. SentinelAI 화면 정책 관리 → [노드] → **노드 등록**에서 서버 이름 입력 → 그 서버의 키가 나옴. 노드 화면에서 언제든 다시 볼 수 있음
2. 점검할 서버에서 실행

```sh
sudo sh install.sh --server http://sentinelai.internal:8000 --key <노드 키>
```

- 노드는 이름 없이 키만 보냄. SentinelAI가 키로 어느 노드인지 찾음
- 서버 쪽 키 보관: `/etc/sentinel-node/node.conf` (0600)
- 키를 잃었거나 새어 나갔으면 [노드]에서 **키 다시 발급** → `sudo sh install.sh --key <새 키>`. 예전 키는 바로 못 씀
- 못 보낸 수집은 `/var/lib/sentinel-node/spool/`에 쌓였다가 다음 차례에 먼저 보냄 (최대 200개)

## 명령

```sh
sudo PYTHONPATH=/opt/sentinel-node python3 -m sentinel_node show     # 무엇을 보내는지 화면에 (보내지 않음)
sudo PYTHONPATH=/opt/sentinel-node python3 -m sentinel_node once     # 지금 한 번 보내기
sudo PYTHONPATH=/opt/sentinel-node python3 -m sentinel_node export -o /tmp/out   # 망이 막힌 서버: 파일로 남김
journalctl -u sentinel-node -f                                        # 데몬 기록
sudo sh install.sh --uninstall [--purge]                              # 제거
```

- 망이 막힌 서버에서 `export`한 파일은 SentinelAI 서버에서 `python -m sentinelai import-snapshots <폴더> --node <이름>`으로 넣음

## 시험

- SentinelAI 저장소에서 실행 (진짜 DB를 건드리지 않는 `.dev/` 시험 환경)

```sh
make dev-setup && make dev            # 시험용 웹 http://127.0.0.1:8001 (계정 dev-op / dev-pass-1234)
make dev-targets                      # 점검 대상 컨테이너 2대(weak · strict) 올리기 — 진짜 노드가 root 로 수집해 보냄
make dev-sim                          # 흉내 노드 3대 — 설정을 조금씩 바꿔 가며 보냄
make dev-targets-stop                 # 내리기
```

- 점검 대상: `testenv/compose.yaml` (podman compose)
- 값: 옵션 파일 `testenv/targets.env`. 처음에는 `make dev-targets`가 시험 환경 키로 만들어 줌
- 화면에서 발급한 키나 다른 서버로 바꾸려면 이 파일을 고친 뒤 다시 `make dev-targets`

```sh
SERVER=http://host.containers.internal:8001    # 컨테이너에서 본 SentinelAI (호스트의 127.0.0.1). 진짜 웹이면 :8000
KEY_WEAK=…                                     # target-weak 의 노드 키
KEY_STRICT=…                                   # target-strict 의 노드 키
INTERVAL=1                                     # 수집 간격(분)
```

- 컨테이너: `testenv/Containerfile` (Ubuntu + ufw · sshd · PAM · sudo). `testenv/target.sh`가 `PROFILE`(weak · strict)대로 설정을 맞춘 뒤 노드를 돌림
- 대상 추가: `compose.yaml`에 서비스를 하나 더 두고 `PROFILE` · `KEY` 지정
- 기록: `cd testenv && podman compose --env-file targets.env logs -f`
