#!/bin/sh
set -eu

ROOT=/opt/cocurdex-relay
SERVICE=cocurdex-relay.service
HEALTH_URL=${COCURDEX_RELAY_HEALTH_URL:-http://127.0.0.1:8081/healthz}
KEEP_RELEASES=3

fail() {
  echo "deploy-cocurdex-relay: $*" >&2
  exit 1
}

release_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo amd64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) fail "unsupported machine $(uname -m)" ;;
  esac
}

healthy() {
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

point_current_at() {
  ln -sfn "$1" "$ROOT/.current.next"
  mv -T "$ROOT/.current.next" "$ROOT/current"
}

switch_to() {
  target=$1
  previous=$(readlink "$ROOT/current" 2>/dev/null || true)
  point_current_at "$target"
  systemctl restart "$SERVICE"
  if healthy; then
    if [ -n "$previous" ] && [ "$previous" != "$target" ]; then
      ln -sfn "$previous" "$ROOT/previous"
    fi
    echo "cocurdex-relay is running $target"
    return 0
  fi
  if [ -n "$previous" ]; then
    point_current_at "$previous"
    systemctl restart "$SERVICE"
    healthy || fail "$target failed its health check and $previous did not recover"
    fail "$target failed its health check; restored $previous"
  fi
  fail "$target failed its health check"
}

prune() {
  current=$(readlink "$ROOT/current" 2>/dev/null || true)
  previous=$(readlink "$ROOT/previous" 2>/dev/null || true)
  kept=0
  # shellcheck disable=SC2045
  for dir in $(ls -1t "$ROOT"); do
    case "$dir" in current | previous | .*) continue ;; esac
    [ -d "$ROOT/$dir" ] || continue
    if [ "$dir" = "$current" ] || [ "$dir" = "$previous" ]; then
      continue
    fi
    kept=$((kept + 1))
    if [ "$kept" -gt "$KEEP_RELEASES" ]; then
      rm -rf -- "${ROOT:?}/$dir"
    fi
  done
}

deploy() {
  version=$1
  echo "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' ||
    fail "invalid version $version"
  incoming=$(mktemp -d "$ROOT/.incoming.XXXXXX")
  trap 'rm -rf -- "$incoming"' EXIT
  tar -xzf - -C "$incoming" --no-same-owner
  package="$incoming/cocurdex-relay-$version-linux-$(release_arch)"
  [ -x "$package/cocurdex-relay" ] || fail "package has no cocurdex-relay binary for $(release_arch)"
  [ -d "$package/web" ] || fail "package has no web directory"
  if [ "$(readlink "$ROOT/current" 2>/dev/null || true)" = "$version" ]; then
    fail "$version is already running"
  fi
  rm -rf -- "${ROOT:?}/$version"
  chown -R root:root "$package"
  mv -T "$package" "$ROOT/$version"
  switch_to "$version"
  prune
}

rollback() {
  previous=$(readlink "$ROOT/previous" 2>/dev/null || true)
  [ -n "$previous" ] && [ -d "$ROOT/$previous" ] || fail "no previous release to roll back to"
  switch_to "$previous"
}

command=${SSH_ORIGINAL_COMMAND:-${1:-}}
case "$command" in
  arch) release_arch ;;
  "deploy "*) deploy "${command#deploy }" ;;
  rollback) rollback ;;
  status) readlink "$ROOT/current" ;;
  *) fail "usage: arch | deploy <version> | rollback | status" ;;
esac
