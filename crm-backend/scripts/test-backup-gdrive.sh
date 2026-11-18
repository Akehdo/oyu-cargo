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
  printf "%s
" "$*" >> "$MOCK_REMOTE/.deletes"
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

export CRM_BACKUP_DIR="$test_dir/corrupt" MOCK_CORRUPT=1
expect_failure
[[ "$(count_files '*.dump')" -eq 1 && "$(count_files '*.uploaded')" -eq 0 ]]
unset MOCK_CORRUPT
echo 'PASS: checksum mismatch is not marked successful'

export CRM_BACKUP_DIR="$test_dir/retention" CRM_BACKUP_KEEP_DAYS=7
mkdir -p "$CRM_BACKUP_DIR"
old_uploaded="$CRM_BACKUP_DIR/crm_2020-01-01T00-00-00Z_old1.dump"
old_pending="$CRM_BACKUP_DIR/crm_2020-01-02T00-00-00Z_old2.dump"
printf old > "$old_uploaded"; printf old > "$old_pending"
touch -d "30 days ago" "$old_uploaded" "$old_pending"
printf hash > "$old_uploaded.uploaded"
MOCK_UPLOAD_FAIL=1 expect_failure
[[ -f "$old_uploaded" && -f "$old_pending" ]]
run_backup
[[ ! -f "$old_uploaded" && ! -f "$old_uploaded.uploaded" ]]
# The pending one was uploaded by this run, then pruned as well.
[[ ! -f "$old_pending" ]]
[[ "$(count_files '*.dump')" -eq 2 ]]
grep -q -- "--min-age 90d" "$MOCK_REMOTE/.deletes"
unset CRM_BACKUP_KEEP_DAYS
echo 'PASS: old uploaded archives are pruned locally and remotely'

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
