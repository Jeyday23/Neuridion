@AGENTS.md

## End-of-session checklist

After completing any feature or fix work, before reporting done:

1. Run `git status` — confirm no untracked or modified files that should have been committed.
2. Run `git log --oneline origin/main..HEAD` — confirm no local-only commits. If any exist, push or flag them explicitly.
3. Never assume work is shipped just because it's committed locally.
