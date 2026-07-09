#!/bin/sh
set -e

mkdir -p "${LOG_DIR:-/var/log/dress-doctor}"

# Runs logrotate once a day in the background. No cron daemon needed —
# this is the container's only background job, and `exec "$@"` below
# still becomes PID 1 so the main process keeps normal signal handling
# (SIGTERM from `docker stop` etc.) for graceful shutdown.
(
  while true; do
    sleep 86400
    logrotate -s /tmp/logrotate.state /etc/logrotate.d/dress-doctor
  done
) &

exec "$@"
