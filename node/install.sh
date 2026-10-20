#!/bin/sh
# SentinelAI 수집 노드 설치 — 점검 대상 서버에서 root 로 돌립니다.
#
#   sudo sh install.sh --name cust-db01 --server http://sentinelai.internal:8000 --token <SENTINELAI_NODE_TOKEN> [--interval 30]
#   sudo sh install.sh --uninstall [--purge]     # 서비스 · 프로그램 제거 (--purge 면 설정 · 키까지)
#
# /opt/sentinel-node 에 프로그램, /etc/sentinel-node/node.conf 에 설정(0600), /var/lib/sentinel-node 에 키 · 못 보낸 수집,
# systemd 서비스 sentinel-node 를 켭니다. 다시 돌리면 프로그램만 바꾸고 이미 있는 설정은 그대로 둡니다 (값을 주면 그 값만 바꿉니다).
set -eu

PREFIX=/opt/sentinel-node
CONF_DIR=/etc/sentinel-node
CONF=$CONF_DIR/node.conf
STATE=/var/lib/sentinel-node
UNIT=/etc/systemd/system/sentinel-node.service
HERE=$(cd "$(dirname "$0")" && pwd)

name="" server="" token="" interval="" uninstall=0 purge=0
while [ $# -gt 0 ]; do
    case "$1" in
        --name) name=$2; shift 2 ;;
        --server) server=$2; shift 2 ;;
        --token) token=$2; shift 2 ;;
        --interval) interval=$2; shift 2 ;;
        --uninstall) uninstall=1; shift ;;
        --purge) purge=1; shift ;;
        *) echo "모르는 옵션: $1" >&2; exit 2 ;;
    esac
done

[ "$(id -u)" -eq 0 ] || { echo "root 로 돌려야 합니다 (sudo sh install.sh …)" >&2; exit 1; }

if [ "$uninstall" -eq 1 ]; then
    systemctl disable --now sentinel-node 2>/dev/null || true
    rm -f "$UNIT"; systemctl daemon-reload
    rm -rf "$PREFIX"
    [ "$purge" -eq 1 ] && rm -rf "$CONF_DIR" "$STATE"
    echo "제거했습니다$([ "$purge" -eq 1 ] && echo " (설정 · 키 포함)")."
    exit 0
fi

python3 -c 'import sys; sys.exit(sys.version_info < (3, 8))' || { echo "python3 3.8 이상이 필요합니다" >&2; exit 1; }

install -d -m 755 "$PREFIX"
rm -rf "$PREFIX/sentinel_node"
cp -r "$HERE/sentinel_node" "$PREFIX/"
find "$PREFIX" -name '__pycache__' -prune -exec rm -rf {} +

install -d -m 700 "$CONF_DIR" "$STATE"
if [ ! -f "$CONF" ]; then
    [ -n "$name" ] && [ -n "$server" ] && [ -n "$token" ] || { echo "처음 설치에는 --name · --server · --token 이 필요합니다" >&2; exit 2; }
    install -m 600 "$HERE/node.conf.example" "$CONF"
fi
# 준 값만 설정 파일에 반영합니다 (sed 구분자와 겹치지 않게 | 를 씁니다).
set_conf() { [ -n "$2" ] && sed -i "s|^$1 *=.*|$1 = $2|" "$CONF"; return 0; }
set_conf name "$name"; set_conf server "$server"; set_conf token "$token"; set_conf interval_min "$interval"
chmod 600 "$CONF"

PYTHONPATH="$PREFIX" python3 -c 'from sentinel_node import config; c = config.load(); print(f"설정 확인: 노드 {c.name} → {c.server}, {c.interval_min}분마다")'

install -m 644 "$HERE/sentinel-node.service" "$UNIT"
systemctl daemon-reload
systemctl enable sentinel-node >/dev/null
systemctl restart sentinel-node
echo "서비스를 켰습니다. 상태: systemctl status sentinel-node · 기록: journalctl -u sentinel-node -f"
echo "보내기 전에 무엇을 보내는지 보려면: sudo PYTHONPATH=$PREFIX python3 -m sentinel_node show"
