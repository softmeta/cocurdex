#!/bin/sh
set -eu

ROOT=/opt/cocurdex-relay
SERVICE=cocurdex-relay.service
HEALTH_URL=${COCURDEX_RELAY_HEALTH_URL:-http://127.0.0.1:8081/healthz}
SMOKE_CREDENTIAL=${COCURDEX_RELAY_SMOKE_CREDENTIAL:-}
RELEASES_URL=${COCURDEX_RELAY_RELEASES_URL:-https://github.com/softmeta/cocurdex/releases/download}
INSTALL_PATH=/usr/local/sbin/deploy-cocurdex-relay
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

smoke_tested() {
  binary="$ROOT/$1/cocurdex-relay"
  "$binary" version >/dev/null 2>&1 || return 0
  if [ -n "$SMOKE_CREDENTIAL" ]; then
    "$binary" smoke --url "${HEALTH_URL%/healthz}" --credential-file "$SMOKE_CREDENTIAL"
  else
    "$binary" smoke --url "${HEALTH_URL%/healthz}"
  fi
}

verified() {
  healthy && smoke_tested "$1"
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
  if verified "$target"; then
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
    fail "$target failed its health or smoke check; restored $previous"
  fi
  fail "$target failed its health or smoke check"
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

download() {
  curl -fsSL --retry 3 --max-time 300 -o "$2" "$RELEASES_URL/$1"
}

deploy() {
  tag=$1
  echo "$tag" | grep -Eq '^relay-v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' ||
    fail "expected a relay release tag such as relay-v0.1.0, got $tag"
  version=${tag#relay-}
  if [ "$(readlink "$ROOT/current" 2>/dev/null || true)" = "$version" ]; then
    fail "$version is already running"
  fi
  package_name="cocurdex-relay-$version-linux-$(release_arch)"
  incoming=$(mktemp -d "$ROOT/.incoming.XXXXXX")
  trap 'rm -rf -- "$incoming"' EXIT
  download "$tag/$package_name.tar.gz" "$incoming/$package_name.tar.gz"
  download "$tag/SHA256SUMS" "$incoming/SHA256SUMS"
  grep -E "  $package_name\.tar\.gz\$" "$incoming/SHA256SUMS" >"$incoming/expected" ||
    fail "SHA256SUMS of $tag does not list $package_name.tar.gz"
  (cd "$incoming" && sha256sum -c --quiet expected) || fail "checksum mismatch for $package_name.tar.gz"
  tar -xzf "$incoming/$package_name.tar.gz" -C "$incoming" --no-same-owner
  package="$incoming/$package_name"
  [ -x "$package/cocurdex-relay" ] || fail "package has no cocurdex-relay binary"
  [ -d "$package/web" ] || fail "package has no web directory"
  rm -rf -- "${ROOT:?}/$version"
  chown -R root:root "$package"
  mv -T "$package" "$ROOT/$version"
  switch_to "$version"
  prune
}

setup() {
  command -v curl >/dev/null || fail "curl is required (apt install curl)"
  command -v sha256sum >/dev/null || fail "sha256sum is required"
  install -m 0755 -o root -g root "$0" "$INSTALL_PATH"
  unit=$(systemctl show -P FragmentPath "$SERVICE")
  [ -n "$unit" ] && [ -f "$unit" ] || fail "cannot find the unit file of $SERVICE"
  if [ ! -L "$ROOT/current" ]; then
    running=$(grep -Eo "$ROOT/[^/[:space:]]+/" "$unit" | grep -v "$ROOT/current/" | head -n 1 || true)
    [ -n "$running" ] || fail "cannot find the running release in $unit"
    point_current_at "$(basename "$running")"
  fi
  if grep -Eo "$ROOT/[^/[:space:]]+/" "$unit" | grep -vq "$ROOT/current/"; then
    cp -p "$unit" "$unit.bak-$(date +%Y%m%d%H%M%S)"
    sed -i -E "s#$ROOT/[^/[:space:]]+/#$ROOT/current/#g" "$unit"
    systemctl daemon-reload
    systemctl restart "$SERVICE"
    healthy || fail "$SERVICE did not come back after switching its unit to $ROOT/current"
  fi
  echo "$SERVICE runs $(readlink "$ROOT/current") from $ROOT/current; deploy with: sudo deploy-cocurdex-relay deploy <relay-vX.Y.Z>"
}

rollback() {
  previous=$(readlink "$ROOT/previous" 2>/dev/null || true)
  [ -n "$previous" ] && [ -d "$ROOT/$previous" ] || fail "no previous release to roll back to"
  switch_to "$previous"
}

[ "$(id -u)" -eq 0 ] || fail "run as root (sudo)"
case "${1:-}" in
  deploy) [ $# -eq 2 ] || fail "usage: deploy <relay-vX.Y.Z>"; deploy "$2" ;;
  rollback) rollback ;;
  status) readlink "$ROOT/current" ;;
  setup) setup ;;
  *) fail "usage: deploy <relay-vX.Y.Z> | rollback | status | setup" ;;
esac
