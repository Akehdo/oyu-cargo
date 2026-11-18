#!/usr/bin/env bash
# Isolated regression checks: Docker, Google Drive, and flock are mocked.
set -Eeuo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT
mkdir -p "$test_dir/bin" "$test_dir/compose" "$test_dir/remote"
touch "$test_dir/compose/docker-compose.yml"
export CRM_COMPOSE_DIR="$test_dir/compose"
export CRM_BACKUP_MODE=gdrive
export CRM_BACKUP_REMOTE='gdrive:test-backups'
export MOCK_REMOTE="$test_dir/remote"
export PATH="$test_dir/bin:$PATH"

cat > "$test_dir/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
if [[ "$*" == *pg_dump* ]]; then
  printf 'PGDMP fake database contents'
  [[ "${MOCK_DUMP_FAIL:-0}" = 0 ]]
elif [[ "$*" == *pg_restore* ]]; then
  cat >/dev/null
  if [[ "${MOCK_AGE_CURRENT:-0}" = 1 ]]; then
    touch -d '30 days ago' "$CRM_BACKUP_DIR"/*.partial
  fi
  [[ "${MOCK_INVALID:-0}" = 0 ]]
else
  exit 99
fi
MOCK
cat > "$test_dir/bin/rclone" <<'MOCK'
#!/usr/bin/env bash
set -eu
if [[ "$1" = copyto ]]; then
  [[ "${MOCK_UPLOAD_FAIL:-0}" = 0 ]] || exit 1
  cp "$2" "$MOCK_REMOTE/${3##*/}"
elif [[ "$1" = cat ]]; then
  if [[ "${MOCK_CORRUPT:-0}" = 1 ]]; then
    printf 'corrupted remote contents'
  else
    cat "$MOCK_REMOTE/${2##*/}"
  fi
elif [[ "$1" = delete ]]; then
  printf '%s\n' "$@" > "$MOCK_REMOTE/.delete-args"
else
  exit 99
fi
MOCK
cat > "$test_dir/bin/flock" <<'MOCK'
#!/usr/bin/env bash
[[ "${MOCK_LOCKED:-0}" = 0 ]]
MOCK
chmod +x "$test_dir/bin/"*

run_backup() { bash "$script_dir/backup-gdrive.sh" > "$test_dir/output" 2>&1; }
expect_failure() {
  if run_backup; then echo 'Expected failure' >&2; exit 1; fi
}
count_files() { find "$CRM_BACKUP_DIR" -maxdepth 1 -name "$1" | wc -l; }

export CRM_BACKUP_DIR="$test_dir/success"
run_backup
[[ "$(count_files '*.dump')" -eq 1 && "$(count_files '*.uploaded')" -eq 1 ]]
echo 'PASS: successful upload and checksum verification'

export CRM_BACKUP_DIR="$test_dir/dump-failure" MOCK_DUMP_FAIL=1
expect_failure
[[ "$(count_files '*.dump')" -eq 0 && "$(count_files '*.partial')" -eq 0 ]]
unset MOCK_DUMP_FAIL
echo 'PASS: failed dump is never uploaded'

export CRM_BACKUP_DIR="$test_dir/invalid-archive" MOCK_INVALID=1
expect_failure
[[ "$(count_files '*.dump')" -eq 0 ]]
unset MOCK_INVALID
echo 'PASS: invalid archive is rejected'

export CRM_BACKUP_DIR="$test_dir/upload-failure" MOCK_UPLOAD_FAIL=1
expect_failure
[[ "$(count_files '*.dump')" -eq 1 && "$(count_files '*.uploaded')" -eq 0 ]]
unset MOCK_UPLOAD_FAIL
run_backup
[[ "$(count_files '*.dump')" -eq 2 && "$(count_files '*.uploaded')" -eq 2 ]]
echo 'PASS: failed upload is preserved and retried on the next run'

export CRM_BACKUP_DIR="$test_dir/changed-before-retry"
MOCK_UPLOAD_FAIL=1 expect_failure
pending=( "$CRM_BACKUP_DIR"/*.dump )
printf 'damaged after the first attempt' > "${pending[0]}"
expect_failure
grep -q 'Local checksum mismatch' "$test_dir/output"
[[ ! -f "${pending[0]}.uploaded" && ! -f "$MOCK_REMOTE/${pending[0]##*/}" ]]
echo 'PASS: a local checksum mismatch stops the retry before upload'

export CRM_BACKUP_DIR="$test_dir/corrupt" MOCK_CORRUPT=1
expect_failure
[[ "$(count_files '*.dump')" -eq 1 && "$(count_files '*.uploaded')" -eq 0 ]]
unset MOCK_CORRUPT
echo 'PASS: checksum mismatch is not marked successful'

export CRM_BACKUP_DIR="$test_dir/retention" CRM_BACKUP_KEEP_DAYS=14
mkdir -p "$CRM_BACKUP_DIR/nested"
old_uploaded="$CRM_BACKUP_DIR/crm_2020-01-01T00-00-00Z_OLD123.dump"
old_pending="$CRM_BACKUP_DIR/crm_2020-01-02T00-00-00Z_OLD234.dump"
bad_marker="$CRM_BACKUP_DIR/crm_2020-01-03T00-00-00Z_BAD123.dump"
manual="$CRM_BACKUP_DIR/crm_cutover_manual.dump"
nested="$CRM_BACKUP_DIR/nested/${old_uploaded##*/}"
for file in "$old_uploaded" "$old_pending" "$bad_marker" "$manual" "$nested"; do
  printf 'old' > "$file"
  touch -d '337 hours ago' "$file"
done
(cd "$CRM_BACKUP_DIR" && sha256sum "${old_uploaded##*/}") > "$old_uploaded.sha256"
cut -d ' ' -f 1 "$old_uploaded.sha256" > "$old_uploaded.uploaded"
printf '%064d\n' 0 > "$bad_marker.uploaded"
printf 'manual sidecar' > "$manual.sha256"
printf 'manual upload marker' > "$manual.uploaded"
MOCK_UPLOAD_FAIL=1 expect_failure
[[ -f "$old_uploaded" && -f "$old_pending" && -f "$bad_marker" ]]
run_backup
[[ ! -f "$old_uploaded" && ! -f "$old_uploaded.sha256" && ! -f "$old_uploaded.uploaded" ]]
[[ ! -f "$old_pending" && -f "$MOCK_REMOTE/${old_pending##*/}" ]]
[[ -f "$bad_marker" && -f "$bad_marker.uploaded" && -f "$nested" ]]
[[ -f "$manual" && -f "$manual.sha256" && -f "$manual.uploaded" ]]
args="$MOCK_REMOTE/.delete-args"
[[ "$(grep -A1 -Fx -- '--max-depth' "$args" | tail -1)" = 1 ]]
[[ "$(grep -A1 -Fx -- '--min-age' "$args" | tail -1)" = 90d ]]
allow="$(sed -n 's/^+ //p' "$args")"
exclude_current="$(sed -n 's@^- /@/@p' "$args")"
[[ "/${old_uploaded##*/}" == $allow && "/${manual##*/}" != $allow && "/nested/${old_uploaded##*/}" != $allow ]]
[[ "/crm_2020-01-01T00-00-00Z_old1.dump" != $allow && -f "$CRM_BACKUP_DIR$exclude_current" ]]
grep -Fxq -- '- **' "$args"
unset CRM_BACKUP_KEEP_DAYS
echo 'PASS: pruning protects manual, nested and unverified archives; remote filters match only managed files'

export CRM_BACKUP_DIR="$test_dir/locked" MOCK_LOCKED=1
expect_failure
[[ "$(count_files '*.dump')" -eq 0 ]]
unset MOCK_LOCKED
echo 'PASS: concurrent invocation is rejected'

mv "$test_dir/bin/rclone" "$test_dir/bin/rclone-disabled"
export CRM_BACKUP_MODE=local CRM_BACKUP_REMOTE='unused-in-local-mode'
export CRM_BACKUP_DIR="$test_dir/local"
run_backup
[[ "$(count_files '*.dump')" -eq 1 && "$(count_files '*.sha256')" -eq 1 ]]
[[ "$(count_files '*.uploaded')" -eq 0 ]]
(cd "$CRM_BACKUP_DIR" && sha256sum -c ./*.sha256)
run_backup
[[ "$(count_files '*.dump')" -eq 2 && "$(count_files '*.sha256')" -eq 2 ]]
(cd "$CRM_BACKUP_DIR" && sha256sum -c ./*.sha256)
echo 'PASS: local mode preserves verified dumps without cloud configuration'

export CRM_BACKUP_DIR="$test_dir/local-retention" CRM_BACKUP_KEEP_DAYS=14
mkdir -p "$CRM_BACKUP_DIR"
age13="$CRM_BACKUP_DIR/crm_2020-01-01T00-00-00Z_AGE013.dump"
just_under="$CRM_BACKUP_DIR/crm_2020-01-01T00-00-00Z_age335.dump"
just_over="$CRM_BACKUP_DIR/crm_2020-01-01T00-00-00Z_age337.dump"
manual="$CRM_BACKUP_DIR/crm_before_release.dump"
touch -d '13 days ago' "$age13"
touch -d '335 hours ago' "$just_under"
touch -d '337 hours ago' "$just_over" "$manual"
touch "$just_over.sha256" "$manual.sha256"
MOCK_AGE_CURRENT=1 run_backup
[[ -f "$age13" && -f "$just_under" && ! -f "$just_over" && ! -f "$just_over.sha256" ]]
[[ -f "$manual" && -f "$manual.sha256" ]]
current="$(sed -n 's/^Local archive verified: //p' "$test_dir/output")"
[[ -f "$current" && -f "$current.sha256" && "$current" -ot "$age13" ]]
echo 'PASS: local pruning uses the 14-day mtime boundary and retains the current backup even if dated earlier'
unset CRM_BACKUP_KEEP_DAYS

export CRM_BACKUP_DIR="$test_dir/local-dump-failure" MOCK_DUMP_FAIL=1
expect_failure
[[ "$(count_files '*.dump')" -eq 0 && "$(count_files '*.partial')" -eq 0 ]]
unset MOCK_DUMP_FAIL
echo 'PASS: local mode removes incomplete dumps'

export CRM_BACKUP_DIR="$test_dir/local-invalid" MOCK_INVALID=1
expect_failure
[[ "$(count_files '*.dump')" -eq 0 && "$(count_files '*.sha256')" -eq 0 ]]
unset MOCK_INVALID
echo 'PASS: local mode rejects invalid archives'

export CRM_BACKUP_DIR="$test_dir/invalid-mode" CRM_BACKUP_MODE=invalid
expect_failure
[[ ! -d "$CRM_BACKUP_DIR" ]]
echo 'PASS: invalid backup mode fails before creating a dump'
