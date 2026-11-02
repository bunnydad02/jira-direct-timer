# Repository instructions

- Read [HANDOFF.md](./HANDOFF.md) before changing this project.
- After completing and validating requested changes, always create a Git commit before reporting completion, unless the user explicitly asks not to commit.
- Follow existing commit conventions and keep unrelated changes out of the commit.
- Before editing, inspect both staged and unstaged changes to establish the task baseline.
- Before every commit, read the complete staged diff and check every hunk against the current request. Commit only task-related changes; never include pre-existing or concurrent work just because it is staged or in the same file. Do not use blanket staging in a dirty or shared worktree.
- If unrelated staged changes or concurrent edits prevent safe isolation, stop and report the blocker instead of committing them or modifying another task's staging.
- After committing, inspect the actual commit diff and status. A clean worktree or passing tests does not prove the commit is in scope. Report any unexpected content explicitly, including in commits created elsewhere; do not rewrite history without permission.
- The user has instructed that requested repository changes should be published and
  completed, not left only on a local branch. For each requested change, push its
  task branch, open a PR to `main`, wait for required checks, merge through GitHub,
  verify the merge on `origin/main`, fast-forward local `main`, and delete the
  completed task branch locally and remotely. Never push directly to protected
  `main` or bypass checks. Use the GitHub MCP for PR operations when available;
  otherwise use the authenticated GitHub API via the configured Git credential
  helper, without exposing credentials. Report blockers clearly.
- After merging a task branch into `main` and verifying the merge is published on `origin/main`, delete that completed task branch locally and on `origin`. Verify it contains no unmerged work before deleting it; never delete `main` or unrelated active branches. Remote branch cleanup is part of an authorized merge-and-push workflow.
