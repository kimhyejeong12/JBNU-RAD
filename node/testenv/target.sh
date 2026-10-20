#!/bin/sh
# 시험용 점검 대상 서버 — PROFILE 대로 보안 설정을 맞춘 뒤 수집 노드를 돌립니다.
#   PROFILE=weak|strict  SERVER=SentinelAI 주소  KEY=노드 키  INTERVAL=분(기본 1)  ONCE=1 이면 한 번만 · SHOW=1 이면 보내지 않고 출력만
set -eu

ssh-keygen -A >/dev/null
mkdir -p /run/sshd /etc/sentinel-node

if [ "${PROFILE:-weak}" = strict ]; then
    printf 'PermitRootLogin no\nPasswordAuthentication no\nMaxAuthTries 3\n' > /etc/ssh/sshd_config.d/10-profile.conf
    sed -i '1i auth required pam_faillock.so preauth deny=5 unlock_time=900' /etc/pam.d/common-auth
    printf 'minlen = 12\ndcredit = -1\nucredit = -1\n' > /etc/security/pwquality.conf
    sed -i 's/^\(password.*pam_unix.so.*\)$/\1 remember=5/' /etc/pam.d/common-password
    sed -i 's/^# *\(auth *required *pam_wheel.so\)$/\1/' /etc/pam.d/su
    ufw default deny incoming >/dev/null; ufw allow from 10.0.0.0/8 to any port 22 proto tcp >/dev/null
else
    printf 'PermitRootLogin yes\nPasswordAuthentication yes\n' > /etc/ssh/sshd_config.d/10-profile.conf
    sed -i 's/pam_unix.so obscure/pam_unix.so nullok obscure/' /etc/pam.d/common-password
    echo 'deploy ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy
    ufw allow 22/tcp >/dev/null; ufw allow 3306/tcp >/dev/null
fi
# 컨테이너에 NET_ADMIN 이 있으면 방화벽을 실제로 켭니다. 없으면 꺼진 채로 수집됩니다.
if ! ufw --force enable >/dev/null 2>&1; then
    # 켜다 실패해도 설정에는 켜짐으로 남아 status 가 오류를 냅니다. 꺼짐으로 되돌려 둡니다.
    sed -i 's/^ENABLED=.*/ENABLED=no/' /etc/ufw/ufw.conf
    echo "ufw 를 켜지 못했습니다 (NET_ADMIN 없음) — 꺼진 상태로 수집합니다" >&2
fi

printf '[node]\nserver = %s\nkey = %s\ninterval_min = %s\n' "$SERVER" "$KEY" "${INTERVAL:-1}" > /etc/sentinel-node/node.conf
chmod 600 /etc/sentinel-node/node.conf
if [ "${SHOW:-}" = 1 ]; then exec python3 -m sentinel_node show; fi
if [ "${ONCE:-}" = 1 ]; then exec python3 -m sentinel_node once; fi
exec python3 -m sentinel_node run
