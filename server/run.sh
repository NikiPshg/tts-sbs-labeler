#!/usr/bin/env bash
# Starts the labeling platform. Always launch detached:
#   setsid nohup /root/labeler/server/run.sh </dev/null >>/root/logs/labeler.log 2>&1 &
set -Eeuo pipefail

export LABELER_DB=/root/labeler/data/labeler.db
export LABELER_DIST=/root/labeler/app/dist
export LABELER_AUDIO_ROOTS=/root/labeler/media:/root/labeler/data/audio
export LABELER_PUBLIC_URL="${LABELER_PUBLIC_URL:-https://hjorwkp55iw385-8888.proxy.runpod.net}"

mkdir -p /root/labeler/data /root/labeler/media /root/logs
cd /root/labeler/server

# CPU only, port 8888 (the pod's exposed HTTP port). Ports 8000/8080 belong to
# the TTS benchmark and must not be touched.
exec /root/labeler/venv/bin/uvicorn app:app \
  --host 0.0.0.0 --port 8888 --workers 1 --log-level info
