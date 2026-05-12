# Secret Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt all API keys behind a password-protected vault so AI tools cannot read plaintext secrets.

**Architecture:** A bash script (`scripts/secrets.sh`) encrypts `.env.local` into `.secrets.enc` using OpenSSL AES-256-CBC. Claude Code deny rules prevent AI tools from reading secret files. The app code is unchanged — it still reads `process.env` at runtime.

**Tech Stack:** Bash, OpenSSL (pre-installed on macOS)

---

### Task 1: Create `scripts/secrets.sh`

**Files:**
- Create: `scripts/secrets.sh`

- [ ] **Step 1: Create the script with all four commands**

```bash
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
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/secrets.sh`

- [ ] **Step 3: Test the lock command**

Run: `cp .env.local .env.local.backup && ./scripts/secrets.sh lock`
Expected: Prompts for password twice, creates `.secrets.enc`, deletes `.env.local`.

Verify: `ls -la .secrets.enc` (file exists, binary content)
Verify: `ls .env.local` (should fail — file deleted)

- [ ] **Step 4: Test the unlock command**

Run: `./scripts/secrets.sh unlock`
Expected: Prompts for password, restores `.env.local`.

Verify: `diff .env.local .env.local.backup` (no differences — content preserved perfectly)

- [ ] **Step 5: Test the status command**

Run: `./scripts/secrets.sh status`
Expected: `UNLOCKED — .env.local exists (plaintext keys on disk)`

Run: `rm .env.local && ./scripts/secrets.sh status`
Expected: `LOCKED — .secrets.enc exists (keys encrypted)`

Run: `./scripts/secrets.sh unlock` (restore for next steps)

- [ ] **Step 6: Test error cases**

Run: `./scripts/secrets.sh unlock`
Expected: `Error: .env.local already exists. Use 'unlock --force' to overwrite.`

Run: `./scripts/secrets.sh unlock --force`
Expected: Prompts for password, overwrites `.env.local`.

- [ ] **Step 7: Clean up backup and commit**

```bash
rm .env.local.backup
git add scripts/secrets.sh
git commit -m "feat: add encrypted secret vault CLI

Co-Authored-By: Neuridion"
```

---

### Task 2: Update `.gitignore` for `.secrets.enc`

**Files:**
- Modify: `.gitignore:54-55`

- [ ] **Step 1: Add exception for `.secrets.enc`**

The current `.gitignore` has:
```
# env files (can opt-in for committing if needed)
.env*
```

Add the exception line right after `.env*`:
```
# env files (can opt-in for committing if needed)
.env*
!.secrets.enc
```

- [ ] **Step 2: Verify git sees the encrypted file**

Run: `git check-ignore .secrets.enc; echo "exit: $?"`
Expected: exit code 1 (file is NOT ignored)

Run: `git check-ignore .env.local; echo "exit: $?"`
Expected: `.env.local` printed, exit code 0 (file IS still ignored)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: allow .secrets.enc in git (encrypted vault file)

Co-Authored-By: Neuridion"
```

---

### Task 3: Harden Claude Code deny rules

**Files:**
- Modify: `.claude/settings.json` (permissions.deny array)

- [ ] **Step 1: Add deny rules to `.claude/settings.json`**

The current `permissions.deny` array contains:
```json
[
  "Bash(cat ~/.ssh/*)",
  "Bash(cat ~/.aws/*)",
  "Bash(cat .env*)",
  "Bash(cat ../.env*)",
  "Bash(rm -rf *)",
  "Read(~/.ssh/**)",
  "Read(~/.aws/**)",
  "Read(**/.env.local)",
  "Read(**/.env.production)",
  "Write(~/.ssh/**)",
  "Write(~/.aws/**)"
]
```

Replace with expanded list:
```json
[
  "Bash(cat ~/.ssh/*)",
  "Bash(cat ~/.aws/*)",
  "Bash(cat .env*)",
  "Bash(cat ../.env*)",
  "Bash(cat ~/.shannon/*)",
  "Bash(rm -rf *)",
  "Read(~/.ssh/**)",
  "Read(~/.aws/**)",
  "Read(**/.env)",
  "Read(**/.env.local)",
  "Read(**/.env.production)",
  "Read(**/.env.development)",
  "Read(**/.env.*.local)",
  "Read(~/.shannon/config.toml)",
  "Write(~/.ssh/**)",
  "Write(~/.aws/**)"
]
```

New entries added:
- `Bash(cat ~/.shannon/*)` — block reading Shannon config via cat
- `Read(**/.env)` — block reading bare `.env` file
- `Read(**/.env.development)` — block reading dev env
- `Read(**/.env.*.local)` — block reading `.env.production.local` etc.
- `Read(~/.shannon/config.toml)` — block reading Shannon config directly

- [ ] **Step 2: Verify deny rules work**

The deny rules take effect on the next Claude Code session. To verify now, check the JSON is valid:

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "security: harden Claude Code deny rules for secret files

Co-Authored-By: Neuridion"
```

---

### Task 4: Final verification and push

- [ ] **Step 1: Run status check**

Run: `./scripts/secrets.sh status`
Expected: Shows current lock state.

- [ ] **Step 2: Verify git state**

Run: `git status`
Expected: Clean working tree (no untracked or modified files).

Run: `git log --oneline -5`
Expected: Three new commits for tasks 1-3.

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```
