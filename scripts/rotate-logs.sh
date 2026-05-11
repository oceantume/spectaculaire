#!/bin/sh
set -e

LOG=/data/logs/access.log
[ -f "$LOG" ] || exit 0

YESTERDAY=$(date -u -d @$(($(date -u +%s) - 86400)) +%Y-%m-%d)
mv "$LOG" "/data/logs/access.log.$YESTERDAY"
kill -USR1 "$(cat /var/run/nginx.pid)"
find /data/logs -name 'access.log.*' -mtime +30 -delete
