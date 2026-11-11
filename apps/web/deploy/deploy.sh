#!/bin/sh
set -eu

ROOT=${COCURDEX_WEB_ROOT_DIR:-/opt/cocurdex-web}
CHECK_URL=${COCURDEX_WEB_CHECK_URL:-}
RELEASES_URL=${COCURDEX_WEB_RELEASES_URL:-https://github.com/softmeta/cocurdex/releases/download}
INSTALL_PATH=/usr/local/sbin/deploy-cocurdex-web
KEEP_RELEASES=3

fail() {
  echo "deploy-cocurdex-web: $*" >&2
  exit 1
}

point_current_at() {
  ln -sfn "$1" "$ROOT/.current.next"
  mv -T "$ROOT/.current.next" "$ROOT/current"
}

serves() {
  [ -z "$CHECK_URL" ] && return 0
  page=$(curl -fsS --max-time 5 "$CHECK_URL" 2>/dev/null) || return 1
  echo "$page" | grep -Fq "$1"
}

switch_to() {
  target=$1
  marker=$(grep -Eo '/assets/index-[^"]+\.js' "$ROOT/$target/index.html" | head -n 1)
  [ -n "$marker" ] || fail "$target/index.html does not load an entry script"
  previous=$(readlink "$ROOT/current" 2>/dev/null || true)
  point_current_at "$target"
  if serves "$marker"; then
    if [ -n "$previous" ] && [ "$previous" != "$target" ]; then
      ln -sfn "$previous" "$ROOT/previous"
    fi
    echo "cocurdex-web serves $target"
    return 0
  fi
  if [ -n "$previous" ]; then
    point_current_at "$previous"
    fail "$CHECK_URL does not serve $target; restored $previous"
  fi
  fail "$CHECK_URL does not serve $target"
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
  echo "$tag" | grep -Eq '^web-v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' ||
    fail "expected a web release tag such as web-v0.1.0, got $tag"
  version=${tag#web-}
  if [ "$(readlink "$ROOT/current" 2>/dev/null || true)" = "$version" ]; then
    fail "$version is already served"
  fi
  mkdir -p "$ROOT"
  package_name="cocurdex-web-$version"
  incoming=$(mktemp -d "$ROOT/.incoming.XXXXXX")
  trap 'rm -rf -- "$incoming"' EXIT
  download "$tag/$package_name.tar.gz" "$incoming/$package_name.tar.gz"
  download "$tag/SHA256SUMS" "$incoming/SHA256SUMS"
  grep -E "  $package_name\.tar\.gz\$" "$incoming/SHA256SUMS" >"$incoming/expected" ||
    fail "SHA256SUMS of $tag does not list $package_name.tar.gz"
  (cd "$incoming" && sha256sum -c --quiet expected) || fail "checksum mismatch for $package_name.tar.gz"
  tar -xzf "$incoming/$package_name.tar.gz" -C "$incoming" --no-same-owner
  package="$incoming/$package_name"
  [ -f "$package/index.html" ] || fail "package has no index.html"
  rm -rf -- "${ROOT:?}/$version"
  chown -R root:root "$package"
  chmod -R a+rX "$package"
  mv -T "$package" "$ROOT/$version"
  switch_to "$version"
  prune
}

setup() {
  command -v curl >/dev/null || fail "curl is required (apt install curl)"
  command -v sha256sum >/dev/null || fail "sha256sum is required"
  install -m 0755 -o root -g root "$0" "$INSTALL_PATH"
  mkdir -p "$ROOT"
  echo "serve $ROOT/current as the web root; deploy with: sudo deploy-cocurdex-web deploy <web-vX.Y.Z>"
}

rollback() {
  previous=$(readlink "$ROOT/previous" 2>/dev/null || true)
  [ -n "$previous" ] && [ -d "$ROOT/$previous" ] || fail "no previous release to roll back to"
  switch_to "$previous"
}

[ "$(id -u)" -eq 0 ] || fail "run as root (sudo)"
case "${1:-}" in
  deploy) [ $# -eq 2 ] || fail "usage: deploy <web-vX.Y.Z>"; deploy "$2" ;;
  rollback) rollback ;;
  status) readlink "$ROOT/current" ;;
  setup) setup ;;
  *) fail "usage: deploy <web-vX.Y.Z> | rollback | status | setup" ;;
esac
