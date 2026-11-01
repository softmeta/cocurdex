#!/bin/sh
set -eu

ROOT=/opt/cocurdex-relay
SERVICE=cocurdex-relay.service
DEPLOY_USER=cocurdex-deploy
DEPLOY_BIN=/usr/local/bin/deploy-cocurdex-relay
SUDOERS=/etc/sudoers.d/cocurdex-deploy

fail() {
  echo "setup-vps: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run as root"
[ $# -eq 2 ] || fail "usage: setup-vps.sh <deploy-script> <ssh-public-key>"
script=$1
public_key=$2
command -v curl >/dev/null || fail "curl is required (apt install curl)"
command -v sudo >/dev/null || fail "sudo is required (apt install sudo)"
echo "$public_key" | grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+( .*)?$' || fail "expected an ssh-ed25519 public key"

install -m 0755 -o root -g root "$script" "$DEPLOY_BIN"

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/var/lib/$DEPLOY_USER" --shell /bin/sh "$DEPLOY_USER"
fi
home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
printf 'restrict,command="sudo -n %s" %s\n' "$DEPLOY_BIN" "$public_key" >"$home/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"
chmod 0600 "$home/.ssh/authorized_keys"

sudoers_next=$(mktemp)
cat >"$sudoers_next" <<SUDOERS
Defaults!$DEPLOY_BIN env_keep += "SSH_ORIGINAL_COMMAND"
$DEPLOY_USER ALL=(root) NOPASSWD: $DEPLOY_BIN
SUDOERS
visudo -cf "$sudoers_next" >/dev/null || fail "generated sudoers file is invalid"
install -m 0440 -o root -g root "$sudoers_next" "$SUDOERS"
rm -f "$sudoers_next"

unit=$(systemctl show -P FragmentPath "$SERVICE")
[ -n "$unit" ] && [ -f "$unit" ] || fail "cannot find the unit file of $SERVICE"
if [ ! -L "$ROOT/current" ]; then
  running=$(grep -Eo "$ROOT/[^/[:space:]]+/" "$unit" | grep -v "$ROOT/current/" | head -n 1 || true)
  [ -n "$running" ] || fail "cannot find the running release in $unit"
  ln -sfn "$(basename "$running")" "$ROOT/current"
fi
if grep -Eq "$ROOT/[^/[:space:]]+/" "$unit" && grep -Eo "$ROOT/[^/[:space:]]+/" "$unit" | grep -vq "$ROOT/current/"; then
  cp -p "$unit" "$unit.bak-$(date +%Y%m%d%H%M%S)"
  sed -i -E "s#$ROOT/[^/[:space:]]+/#$ROOT/current/#g" "$unit"
  systemctl daemon-reload
  systemctl restart "$SERVICE"
fi

SSH_ORIGINAL_COMMAND=status "$DEPLOY_BIN"
echo "setup-vps: $SERVICE now runs from $ROOT/current; $DEPLOY_USER can deploy"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
