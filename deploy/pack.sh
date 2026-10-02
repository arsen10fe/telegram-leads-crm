#!/usr/bin/env bash
# Builds lidogram-release.tgz: exactly what the server needs to build the image and run compose.
# An allowlist, not a denylist, so secrets, the dev compose file and Caddy can never slip in
# (docs/deployment.md, "Повторный деплой").
#   deploy/pack.sh   → ./lidogram-release.tgz
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="lidogram-release.tgz"
ALLOWLIST=(
  package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs prisma.config.ts
  Dockerfile .dockerignore compose.prod.yml
  prisma src scripts deploy/backup.sh
)
# Never on the shared host: env files, the dev compose file, the Caddy edge, build output, the brief.
FORBIDDEN='(^|/)\.env|(^|/)compose\.yml$|(^|/)compose\.edge\.yml$|(^|/)Caddyfile$|(^|/)node_modules(/|$)|(^|/)\.next(/|$)|^data(/|$)|(^|/)\._'

log() { printf '[pack] %s\n' "$*"; }

for path in "${ALLOWLIST[@]}"; do
  if [[ ! -e "$path" ]]; then
    log "ABORT: allowlisted path is missing: $path"
    exit 1
  fi
done

TAR_FLAGS=(--no-xattrs)
# macOS bsdtar: no AppleDouble (._*) files and no Mac metadata headers for GNU tar to warn about.
if tar --version 2>/dev/null | grep -q bsdtar; then TAR_FLAGS+=(--no-mac-metadata); fi

log "packing ${#ALLOWLIST[@]} allowlisted paths into $OUT"
COPYFILE_DISABLE=1 tar "${TAR_FLAGS[@]}" --exclude 'src/generated' --exclude '.DS_Store' \
  -czf "$OUT" "${ALLOWLIST[@]}"

listing="$(tar -tzf "$OUT")"
if forbidden="$(grep -E "$FORBIDDEN" <<<"$listing")"; then
  log "ABORT: forbidden paths in the archive:"
  printf '%s\n' "$forbidden"
  rm -f "$OUT"
  exit 1
fi
if [[ ! -x deploy/backup.sh ]]; then
  log "ABORT: deploy/backup.sh is not executable (cron runs it directly)"
  rm -f "$OUT"
  exit 1
fi

commit="$(git rev-parse --short HEAD 2>/dev/null || echo uncommitted)"
if [[ "$commit" != "uncommitted" && -n "$(git status --porcelain 2>/dev/null)" ]]; then commit="$commit+dirty"; fi
log "ok: $(wc -l <<<"$listing" | tr -d ' ') entries, $(du -h "$OUT" | cut -f1 | tr -d ' '), commit $commit"
