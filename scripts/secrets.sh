#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env.local"
ENC_FILE="$PROJECT_ROOT/.secrets.enc"
CIPHER="aes-256-cbc"

usage() {
  echo "Usage: secrets.sh <command>"
  echo ""
  echo "Commands:"
  echo "  lock       Encrypt .env.local → .secrets.enc, delete plaintext"
  echo "  unlock     Decrypt .secrets.enc → .env.local"
  echo "  edit       Decrypt, open in editor, re-encrypt"
  echo "  status     Show whether secrets are locked or unlocked"
  exit 1
}

cmd_lock() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found. Nothing to lock."
    exit 1
  fi

  read -s -p "Master password: " PASS; echo
  read -s -p "Confirm password: " PASS2; echo

  if [ "$PASS" != "$PASS2" ]; then
    echo "Error: Passwords do not match."
    exit 1
  fi

  openssl enc -$CIPHER -pbkdf2 -salt -in "$ENV_FILE" -out "$ENC_FILE.tmp" -pass "pass:$PASS"

  mv "$ENC_FILE.tmp" "$ENC_FILE"
  rm "$ENV_FILE"
  echo "Locked. .env.local encrypted and deleted."
}

cmd_unlock() {
  if [ ! -f "$ENC_FILE" ]; then
    echo "Error: $ENC_FILE not found. Nothing to unlock."
    exit 1
  fi

  if [ -f "$ENV_FILE" ] && [ "${1:-}" != "--force" ]; then
    echo "Error: $ENV_FILE already exists. Use 'unlock --force' to overwrite."
    exit 1
  fi

  read -s -p "Master password: " PASS; echo

  if ! openssl enc -$CIPHER -pbkdf2 -d -salt -in "$ENC_FILE" -out "$ENV_FILE.tmp" -pass "pass:$PASS" 2>/dev/null; then
    rm -f "$ENV_FILE.tmp"
    echo "Error: Decryption failed. Wrong password?"
    exit 1
  fi

  mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "Unlocked. .env.local restored."
}

cmd_edit() {
  if [ ! -f "$ENC_FILE" ]; then
    echo "Error: $ENC_FILE not found. Nothing to edit."
    exit 1
  fi

  TMPFILE=$(mktemp)
  trap "rm -f $TMPFILE" EXIT

  read -s -p "Master password: " PASS; echo

  if ! openssl enc -$CIPHER -pbkdf2 -d -salt -in "$ENC_FILE" -out "$TMPFILE" -pass "pass:$PASS" 2>/dev/null; then
    echo "Error: Decryption failed. Wrong password?"
    exit 1
  fi

  ${EDITOR:-nano} "$TMPFILE"

  openssl enc -$CIPHER -pbkdf2 -salt -in "$TMPFILE" -out "$ENC_FILE" -pass "pass:$PASS"
  echo "Changes encrypted and saved."
}

cmd_status() {
  if [ -f "$ENV_FILE" ]; then
    echo "UNLOCKED — .env.local exists (plaintext keys on disk)"
  elif [ -f "$ENC_FILE" ]; then
    echo "LOCKED — .secrets.enc exists (keys encrypted)"
  else
    echo "NO SECRETS — neither .env.local nor .secrets.enc found"
  fi
}

case "${1:-}" in
  lock)   cmd_lock ;;
  unlock) cmd_unlock "${2:-}" ;;
  edit)   cmd_edit ;;
  status) cmd_status ;;
  *)      usage ;;
esac
