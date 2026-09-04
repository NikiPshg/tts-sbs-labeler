#!/usr/bin/env bash
# Restarts the labeler if it stops answering. There is no systemd in this
# container, so this loop is the supervisor. Launch it detached:
#   setsid nohup /root/labeler/server/keepalive.sh </dev/null >>/root/logs/labeler-keepalive.log 2>&1 &
LOG=/root/logs/labeler.log

while true; do
  if ! curl -sf -m 5 http://127.0.0.1:8888/healthz > /dev/null 2>&1; then
    echo "$(date -Is) health check failed — restarting"
    pkill -f 'uvicorn app:app' 2>/dev/null
    sleep 2
    setsid nohup /root/labeler/server/run.sh < /dev/null >> "$LOG" 2>&1 &
    sleep 10
  fi
  sleep 30
done
