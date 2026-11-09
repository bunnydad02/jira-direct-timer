## Changes

-

## Validation

- [ ] `npm test` passes locally (syntax, Node regressions, release checks, security audit, Chromium)

## Release security checklist

Only for PRs that raise `@version` (see HANDOFF.md, "Security review before release"):

- [ ] No new userscript permissions: `@match`, `@grant`, `@connect`, `@require`, `@updateURL` and `@downloadURL` are unchanged (or the change was reviewed and `.github/security-audit.cjs` updated deliberately).
- [ ] All data from Jira, `localStorage` or the URL is rendered via `textContent` / attributes, never via `innerHTML`.
- [ ] New Jira writes are idempotent (marker + pending state), target the issue the user sees, and verify the signed-in user where ownership matters.
- [ ] New inputs (form fields, stored state, Jira responses) are validated before use.
- [ ] Security review of `git diff v<previous>..HEAD` done; findings filed as issues with the `security` label.
