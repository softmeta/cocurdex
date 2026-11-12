#!/bin/sh
# Installs the headless Cocurdex daemon and CLI from a GitHub release.
#   curl -fsSL https://github.com/softmeta/cocurdex/releases/latest/download/install.sh | sh
# COCURDEX_VERSION=1.2.3 pins a release, COCURDEX_DOWNLOAD_URL names a mirror that
# holds the release assets, and COCURDEX_INSTALL_DIR and COCURDEX_BIN_DIR override
# where it lands.
set -eu

REPOSITORY="softmeta/cocurdex"

fail() {
  echo "cocurdex install: $*" >&2
  exit 1
}

detect_target() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "unsupported system $(uname -s); use install.ps1 on Windows" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "unsupported architecture $(uname -m)" ;;
  esac
  echo "$os-$arch"
}

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "curl or wget is required"
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    fail "sha256sum or shasum is required"
  fi
}

target="$(detect_target)"
name="cocurdex-headless-$target"
asset="$name.tar.gz"
if [ -n "${COCURDEX_DOWNLOAD_URL:-}" ]; then
  base="${COCURDEX_DOWNLOAD_URL%/}"
elif [ -n "${COCURDEX_VERSION:-}" ]; then
  base="https://github.com/$REPOSITORY/releases/download/v${COCURDEX_VERSION#v}"
else
  base="https://github.com/$REPOSITORY/releases/latest/download"
fi
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
install_dir="${COCURDEX_INSTALL_DIR:-$data_home/cocurdex}"
bin_dir="${COCURDEX_BIN_DIR:-$HOME/.local/bin}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT INT TERM

echo "Downloading $asset"
download "$base/$asset" "$work/$asset"
download "$base/$asset.sha256" "$work/$asset.sha256"
expected="$(cut -d ' ' -f 1 <"$work/$asset.sha256")"
actual="$(sha256_of "$work/$asset")"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset"

mkdir -p "$work/extract"
tar -xzf "$work/$asset" -C "$work/extract"
[ -x "$work/extract/$name/bin/cocurdex" ] || fail "$asset has no bin/cocurdex"

was_running=0
if [ -x "$install_dir/bin/cocurdex" ]; then
  stop_result="$("$install_dir/bin/cocurdex" daemon stop --json)" ||
    fail "could not stop the running daemon; retry when it is idle"
  case "$stop_result" in
    *'"stopped"'*)
      was_running=1
      echo "Stopped the daemon to upgrade it"
      ;;
    *'"notRunning"'*) ;;
    *) fail "unexpected output from cocurdex daemon stop: $stop_result" ;;
  esac
fi

mkdir -p "$(dirname "$install_dir")"
staged="$install_dir.new"
rm -rf "$staged" "$install_dir.old"
mv "$work/extract/$name" "$staged"
if [ -e "$install_dir" ]; then
  mv "$install_dir" "$install_dir.old"
fi
mv "$staged" "$install_dir"
rm -rf "$install_dir.old"

mkdir -p "$bin_dir"
ln -sf "$install_dir/bin/cocurdex" "$bin_dir/cocurdex"

echo "Installed $(head -n 1 "$install_dir/VERSION") to $install_dir"
if [ "$was_running" = 1 ]; then
  "$install_dir/bin/cocurdex" daemon status >/dev/null
  echo "Restarted the daemon"
fi
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Add $bin_dir to PATH to run cocurdex" ;;
esac
echo "Run \`cocurdex daemon background on\` to keep the daemon running across reboots"
