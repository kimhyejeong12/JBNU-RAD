# SentinelAI 수집 노드

점검 대상 서버에서 도는 데몬입니다. 정해진 간격마다 보안 모듈 상태를 **읽기만** 해서 SentinelAI 서버로 보냅니다.
SentinelAI는 노드 이름별로 쌓고, 새 수집이 온 노드를 주기적으로 기준 문서와 비교해 정책 관리 화면의 서버 점검에 올립니다.

| 모듈 | 읽는 것 |
|---|---|
| `ufw` | `ufw status verbose` |
| `sshd` | `sshd -T` (root 필요) |
| `pam` | `/etc/pam.d/{common-auth, common-password, system-auth, password-auth, sshd, su, sudo}` · `faillock.conf` · `pwquality.conf` |
| `accounts` | UID 0 계정 · sudo/wheel/admin 그룹 · `/etc/sudoers` · `/etc/sudoers.d/*` (root 필요) |

원문을 그대로 보내고, 무엇을 뽑아 판정할지는 서버(`sentinelai/data/collected.py`)가 정합니다.

## 설치

필요한 것: Python 3.8 이상 (표준 라이브러리만), systemd, root.

```sh
sudo sh install.sh --name cust-db01 --server http://sentinelai.internal:8000 --token <SENTINELAI_NODE_TOKEN>
```

- `--token`은 SentinelAI 서버 `.env`의 `SENTINELAI_NODE_TOKEN`입니다. 처음 보낼 때 이 토큰으로 등록되고, 서버가 이 노드만의 키를 돌려줍니다 (`/var/lib/sentinel-node/node.key`). 그 뒤로는 키로만 보냅니다.
- 같은 이름을 다른 서버가 쓰면 키가 달라 거부됩니다. 노드를 다시 깔아 키를 잃었으면 정책 관리 → [노드]에서 **키 초기화** 후 다시 시작하세요.
- 서버에 보내지 못한 수집은 `/var/lib/sentinel-node/spool/`에 쌓였다가 다음 차례에 먼저 보냅니다 (최대 200개).

## 명령

```sh
sudo PYTHONPATH=/opt/sentinel-node python3 -m sentinel_node show     # 무엇을 보내는지 화면에 (보내지 않음)
sudo PYTHONPATH=/opt/sentinel-node python3 -m sentinel_node once     # 지금 한 번 보내기
sudo PYTHONPATH=/opt/sentinel-node python3 -m sentinel_node export -o /tmp/out   # 망이 막힌 서버: 파일로 남김
journalctl -u sentinel-node -f                                        # 데몬 기록
sudo sh install.sh --uninstall [--purge]                              # 제거
```

망이 막힌 서버에서 `export`한 파일은 SentinelAI 서버에서 `python -m sentinelai import-snapshots <폴더>`로 넣습니다.
