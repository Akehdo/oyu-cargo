#!/usr/bin/env bash
set -Eeuo pipefail
: "${CRM_COMPOSE_DIR:?Set CRM_COMPOSE_DIR to the backend directory}"
exec 9>/run/lock/crm-certbot.lock
flock -n 9 || exit 0
cd -- "$CRM_COMPOSE_DIR"
compose=(docker compose -f docker-compose.yml -f docker-compose.production.yml)
# Certbot can renew one lineage and fail another. Load any renewed files
# while still reporting the renewal error to the systemd timer.
renew_status=0
"${compose[@]}" run --rm --no-deps certbot renew --non-interactive || renew_status=$?
"${compose[@]}" exec -T frontend nginx -t
"${compose[@]}" exec -T frontend nginx -s reload
exit "$renew_status"
