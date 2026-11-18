#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

# Run on the Linux Docker host; credentials remain in the container/rclone config.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_dir="${CRM_COMPOSE_DIR:-$(dirname -- "$script_dir")}"
backup_dir="${CRM_BACKUP_DIR:-/var/backups/crm/postgres}"
mode="${CRM_BACKUP_MODE:-gdrive}"
remote="${CRM_BACKUP_REMOTE:-gdrive:CRM-backups/postgres}"
# 0 disables pruning.
keep_days="${CRM_BACKUP_KEEP_DAYS:-14}"
remote_keep_days="${CRM_BACKUP_REMOTE_KEEP_DAYS:-90}"
# The timestamp and six random characters are the format used by mktemp below.
digits='[0-9][0-9]'
alnum='[A-Za-z0-9]'
archive_pattern="crm_${digits}${digits}-${digits}-${digits}T${digits}-${digits}-${digits}Z_${alnum}${alnum}${alnum}${alnum}${alnum}${alnum}.dump"

fail() { printf 'Backup failed: %s\n' "$*" >&2; exit 1; }
[[ "$keep_days" =~ ^[0-9]+$ ]] || fail 'CRM_BACKUP_KEEP_DAYS must be a whole number of days'
[[ "$remote_keep_days" =~ ^[0-9]+$ ]] || fail 'CRM_BACKUP_REMOTE_KEEP_DAYS must be a whole number of days'
[[ "$backup_dir" = /* ]] || fail 'CRM_BACKUP_DIR must be an absolute path'
case "$mode" in
  local) ;;
  gdrive)
    [[ "$remote" =~ ^[a-zA-Z0-9_-]+:.+ ]] || fail 'Use a named rclone remote and a dedicated folder'
    command -v rclone >/dev/null || fail 'Missing command: rclone'
    ;;
  *) fail 'CRM_BACKUP_MODE must be local or gdrive' ;;
esac
for command in docker flock sha256sum mktemp date cmp; do
  command -v "$command" >/dev/null || fail "Missing command: $command"
done
[[ -f "$compose_dir/docker-compose.yml" ]] || fail 'docker-compose.yml not found'
mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || fail 'Another backup is already running'

partial=''
cleanup() {
  local status=$?
  if [[ -n "$partial" ]]; then rm -f -- "$partial"; fi
  if (( status != 0 )); then
    printf 'Backup failed. Completed local archives are preserved for retry.\n' >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose=(docker compose --project-directory "$compose_dir" -f "$compose_dir/docker-compose.yml")
partial="$(mktemp "$backup_dir/crm_$(date -u +%Y-%m-%dT%H-%M-%SZ)_XXXXXX.partial")"
printf 'Creating PostgreSQL backup...\n'
"${compose[@]}" exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$partial"
[[ -s "$partial" ]] || fail 'pg_dump returned an empty archive'
# This validates the archive index; a separate restore drill is still required.
"${compose[@]}" exec -T postgres pg_restore --list < "$partial" > /dev/null
current_archive="${partial%.partial}.dump"
mv -- "$partial" "$current_archive"
partial=''
(cd "$backup_dir" && sha256sum "${current_archive##*/}") > "$current_archive.sha256"
printf 'Local archive verified: %s\n' "$current_archive"

shopt -s nullglob
prune_local() {
  [[ "$keep_days" =~ ^0+$ ]] && return 0
  local cutoff mtime archive hash
  # UTC timestamps with nanoseconds sort chronologically and preserve the exact boundary.
  cutoff="$(date -u -d "$keep_days days ago" +%Y%m%d%H%M%S%N)"
  for archive in "$backup_dir"/crm_*.dump; do
    [[ "${archive##*/}" == $archive_pattern && "$archive" != "$current_archive" && -f "$archive" && ! -L "$archive" ]] || continue
    mtime="$(date -ur "$archive" +%Y%m%d%H%M%S%N)"
    [[ "$mtime" < "$cutoff" ]] || continue
    if [[ "$mode" = gdrive ]]; then
      [[ -f "$archive.uploaded" && ! -L "$archive.uploaded" ]] || continue
      hash="$(sha256sum < "$archive")"
      if ! printf '%s\n' "${hash%% *}" | cmp -s - "$archive.uploaded"; then
        printf 'Keeping local archive with an invalid upload marker: %s\n' "${archive##*/}" >&2
        continue
      fi
    fi
    rm -f -- "$archive" "$archive.sha256" "$archive.uploaded"
    printf 'Removed old local archive: %s\n' "${archive##*/}"
  done
}

if [[ "$mode" = local ]]; then
  prune_local
  printf 'Backup completed successfully (local mode).\n'
  exit 0
fi

# Retry previously completed archives too. A marker is written only after a
# complete read-back checksum verification of the remote object.
for archive in "$backup_dir"/crm_*.dump; do
  [[ -f "$archive" && ! -L "$archive" ]] || continue
  [[ -f "$archive.uploaded" ]] && continue
  filename="${archive##*/}"
  local_hash="$(sha256sum < "$archive")"
  local_hash="${local_hash%% *}"
  if [[ -e "$archive.sha256" || -L "$archive.sha256" ]]; then
    [[ -f "$archive.sha256" && ! -L "$archive.sha256" ]] || fail "Invalid checksum file for $filename"
    read -r saved_hash _ < "$archive.sha256" || fail "Unreadable checksum for $filename"
    [[ "$saved_hash" = "$local_hash" ]] || fail "Local checksum mismatch for $filename"
  fi
  destination="${remote%/}/$filename"
  printf 'Uploading %s...\n' "$filename"
  rclone copyto "$archive" "$destination" --immutable --retries 3 --contimeout 30s --timeout 5m
  remote_hash="$(rclone cat "$destination" --retries 3 --contimeout 30s --timeout 5m | sha256sum)"
  remote_hash="${remote_hash%% *}"
  [[ "$local_hash" = "$remote_hash" ]] || fail "Checksum mismatch for $filename"
  printf '%s\n' "$local_hash" > "$archive.uploaded"
  printf 'Verified: %s\n' "$destination"
done

prune_local
if [[ ! "$remote_keep_days" =~ ^0+$ ]]; then
  printf 'Removing remote archives older than %s days...\n' "$remote_keep_days"
  rclone delete "${remote%/}" --max-depth 1 --min-age "${remote_keep_days}d" \
    --filter "- /${current_archive##*/}" --filter "+ /$archive_pattern" --filter '- **' \
    --retries 3 --contimeout 30s --timeout 5m
fi
printf 'Backup completed successfully.\n'
