# Secret Vault — Encrypted Key Management

## Problem

AI development tools (Claude Code, Shannon) read plaintext API keys from `.env.local` and `~/.shannon/config.toml` into conversation context, exposing them. Today's session leaked an Anthropic API key via Shannon config and required key rotation.

## Goal

Prevent AI tools from reading plaintext secrets while keeping the developer workflow simple. One command to unlock keys for development, one command to lock them when done.

## Architecture

Three components:

1. **`scripts/secrets.sh`** — Bash CLI for encrypting/decrypting secrets
2. **`.secrets.enc`** — AES-256-CBC encrypted blob, safe to commit to git
3. **Claude Code deny rules** — Block AI tools from reading `.env*` and secret config files

## Component: `scripts/secrets.sh`

Bash script using `openssl aes-256-cbc -pbkdf2` for encryption. Four commands:

- `unlock` — Decrypt `.secrets.enc` → `.env.local`. Prompts for master password via `read -s`.
- `lock` — Encrypt `.env.local` → `.secrets.enc`. Prompts for master password. Deletes `.env.local` after successful encryption.
- `edit` — Decrypt to temp file, open in `$EDITOR` (default `nano`), re-encrypt on save, wipe temp file.
- `status` — Report whether `.env.local` exists (unlocked) or only `.secrets.enc` exists (locked).

Requirements:
- Uses `openssl` (pre-installed on macOS).
- Password never stored on disk — always prompted interactively.
- On `lock`, verify encryption succeeded before deleting plaintext.
- On `unlock`, refuse to overwrite existing `.env.local` unless `--force` flag passed.
- Exit codes: 0 success, 1 error.

## Component: `.secrets.enc`

- AES-256-CBC encrypted file containing the full `.env.local` contents.
- Safe to commit to git (encrypted, password-protected).
- `.gitignore` already excludes `.env*` — add an exception: `!.secrets.enc`.

## Component: Claude Code Deny Rules

Add to `.claude/settings.json` `deny` list:
- `Read` tool blocked for: `.env`, `.env.local`, `.env.production`, `.env.development`
- `Read` tool blocked for: `**/config.toml` (catches `~/.shannon/config.toml`)
- `Bash` tool blocked for commands containing: `cat .env`, `cat ~/.shannon`

This prevents any future Claude Code session from reading secrets into context.

## What Does NOT Change

- Application code — all files continue reading `process.env` as before.
- Render production env vars — managed via Render dashboard, already encrypted.
- `NEXT_PUBLIC_*` vars — public by design, no change needed.
- Shannon config — user manually updates `~/.shannon/config.toml` outside the vault scope (it's per-tool, not per-project).

## Files

| Action | Path |
|--------|------|
| Create | `scripts/secrets.sh` |
| Modify | `.gitignore` (add `!.secrets.enc`) |
| Modify | `.claude/settings.json` (add deny rules) |

## Testing

- `./scripts/secrets.sh lock` encrypts `.env.local`, deletes plaintext, creates `.secrets.enc`.
- `./scripts/secrets.sh unlock` restores `.env.local` from `.secrets.enc`.
- `./scripts/secrets.sh status` reports locked/unlocked state.
- After locking, `cat .env.local` fails (file doesn't exist).
- After locking, `.secrets.enc` is binary/not readable as plaintext.
- Claude Code `Read .env.local` is denied by settings.

## Out of Scope

- Team key sharing (solo developer for now).
- Automatic key rotation.
- Runtime vault integration (Doppler, Infisical, HashiCorp Vault).
- Production secret management (Render handles this).
