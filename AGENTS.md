# Repository instructions

- Read [HANDOFF.md](./HANDOFF.md) before changing this project.
- After completing and validating requested changes, always create a Git commit before reporting completion, unless the user explicitly asks not to commit.
- Follow existing commit conventions and keep unrelated changes out of the commit.
- Before editing, inspect both staged and unstaged changes to establish the task baseline.
- Before every commit, read the complete staged diff and check every hunk against the current request. Commit only task-related changes; never include pre-existing or concurrent work just because it is staged or in the same file. Do not use blanket staging in a dirty or shared worktree.
- If unrelated staged changes or concurrent edits prevent safe isolation, stop and report the blocker instead of committing them or modifying another task's staging.
- After committing, inspect the actual commit diff and status. A clean worktree or passing tests does not prove the commit is in scope. Report any unexpected content explicitly, including in commits created elsewhere; do not rewrite history without permission.
- Do not push without explicit permission. Report any validation or commit blocker clearly.
