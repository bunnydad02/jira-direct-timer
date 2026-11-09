# Jira Local Workspace: timer handoff

## Scope

The project contains one Tampermonkey userscript: the standalone Jira worklog
timer in `jira-workspace-timer.user.js`, with regression tests in
`jira-workspace-timer.test.cjs`. Keep the project timer-only.

The timer runs on `https://jira.alza.cz/*`, uses the existing Jira session, and
saves worklogs directly to Jira. It does not synchronize with or control
Clockify. It hides the legacy `#timer-sidebar` visually, but does not uninstall
the server plugin, stop its timers, or disable its scripts/network requests.
Users should stop competing timers and avoid duplicate time entries.

No build, package manager, API key, server component, or Clockify account is
required. The userscript has no grants and initializes only in the top-level
page. Preserve its name, namespace, storage key, lock name, and worklog marker
for compatibility with installed copies and saved timer state.

## Behavior to preserve

- `START` starts on the open issue. If another issue is tracked, save that
  timer first and start the selected issue at the prior timer's end time.
  Navigation alone never switches timers. The open issue is the `/browse/<KEY>`
  path key; `selectedIssue` applies only when the path names no issue (boards,
  backlogs), then the `ajs-issue-key` meta tag. The panel does not show a
  separate write-target label.
- `STOP` stops and saves the tracked issue. `CANCEL` discards only the current
  unsaved timer; it never deletes a saved Jira worklog. Actions have no
  confirmation dialogs.
- `ADD MINUTES` accepts positive whole minutes and records against the open
  issue, ending at submission time. Enter submits as well as the button.
  Independent manual entry does not change a running timer; intervals can
  overlap, so users must avoid recording the same time twice.
- `AUTO` is disabled by default and starts at 10 minutes. When enabled, observe
  successful Jira REST issue creation responses from `fetch` and
  `XMLHttpRequest` whose resolved URL has the Jira page's own origin, then
  record the configured duration on the returned issue
  key. Also observe the same-origin Jira Server creation forms
  `/secure/QuickCreateIssue.jspa`, `/secure/CreateIssueDetails.jspa` and
  `/secure/CreateSubTaskIssueDetails.jspa`
  (including Sub-task Bug), whose JSON response returns `issueKey`.
  Only POST submission is observed, not form initialization; require a valid
  returned key before queuing a worklog. Issue creation
  outside this Jira page is not observed. Automatic worklogs must not overwrite
  or alter the active timer.
- Elapsed time is based on wall-clock timestamps and refreshes every 100ms.
  Jira worklogs have a one-minute minimum; longer durations are rounded down
  to whole minutes.
- The 240px panel uses green for the open tracked issue, blue for a different
  tracked issue, and red when idle. Issue and title link to the tracked issue.
  The current issue's all-pages worklog total for the signed-in user appears
  below the clock, with that user's total including subtasks in parentheses
  only when exact seconds differ. Resolve the user via `/rest/api/2/myself`
  and match worklog `author` by shared stable `key`, `accountId`, or `name`
  (in that priority order), never by display name or `updateAuthor`.
  Enumerate `fields=subtasks` and page through each child's worklogs using
  the same author filter; Jira's aggregate time fields include other users
  and must not supply personal totals. Missing identities, malformed subtask
  lists, or unreadable worklogs are visible errors, not zero/partial totals.
- Save/discard confirmations are transient, separate toasts. Saved toasts show
  recorded duration; discarded toasts show measured duration. Do not replay
  toasts from persisted data after reload.
- Preserve remaining estimate when posting worklogs. No timer operation should
  make an unrequested write to Jira.

## Persistence and recovery

- `jira-direct-timer-v1` in Jira-origin `localStorage` stores one timer shared
  across tabs in the same browser profile and Jira origin. It is not keyed by
  Jira account. Never clear or silently replace it.
- `jira-direct-timer-auto-settings-v1` stores the opt-in flag and whole-minute
  duration. `jira-direct-timer-auto-queue-v1` stores automatic worklogs
  independently of the single timer state. Keep each queue entry pending
  before POST, verify its exact marker after an uncertain result, and never
  retry an uncertain POST when no marker is found. Surface malformed state and
  errors; do not silently discard queued entries.
- The base record contains `id`, `issue`, `started`, `ended`, and `phase`.
  Preserve compatibility with optional legacy fields including `title`,
  `nextIssue`, `manualNext`, `manual`, `worklogId`, `recordedSeconds`,
  `completedAt`, and `manualEntry`.
- Phases are `running`, `stopped`, `pending`, and `saved`. Persist `pending`
  before POST. Serialize mutations with `navigator.locks.request`; if locks
  are unavailable or busy, show an error rather than writing unsafely.
- Worklogs include `[jira-direct-timer:<id>]`. Before recovery, page through
  Jira worklogs looking for that exact marker on a worklog authored by the
  signed-in user (same `isOwnWorklog` identity rules as totals); another
  user's worklog with the marker never confirms a save. Identity is read only
  when a marker is found; if it is then unavailable, report an error without
  POSTing. If found, confirm the save.
  If not found after an uncertain POST, report the issue and do not retry
  automatically; the user must inspect Jira's Work log to avoid duplicates.
- Preserve `nextIssue` and `manualNext` intent across failures. An independent
  `manualEntry` persists under its running parent; do not remove it until its
  save is confirmed. While unresolved, block actions that could overwrite it.
- Keep pending-write errors visible. Routine saving should not flash transient
  recovery controls; render a pre-action snapshot while a local action is busy
  and render persisted state immediately on completion or error.
- Read-only worklog totals page through the issue endpoint, surface errors,
  and invalidate cached totals after a confirmed save.
- Do not clear site data, switch Jira users, or create diagnostic worklogs
  during maintenance. Tests must use mocks and must not contact Jira.

## Validation and release

Run from the repository root on Windows:

```powershell
node --check .\jira-workspace-timer.user.js
node .\jira-workspace-timer.test.cjs
```

Tests use Node built-ins and simulated DOM, storage, time, locks, and fetch.
They do not create real worklogs. CI runs both commands on pull requests and
pushes to `main`.

The local visual playground runs with `npm run playground` at
`http://127.0.0.1:4173` without dependencies. It executes the unmodified
userscript with injected, memory-only Jira/storage/clock/lock mocks. CSP
blocks network connections, the loopback server rejects writes, and panel
links are intercepted locally. Refresh discards all fixture data.
`tests/scenarios.js` is shared by the interactive runner and Chromium tests.
For automated browser validation, run `npm ci`, then
`npx playwright install chromium`, then `npm test` (Node and browser tests).
CI also runs these browser regressions and retains failure traces/screenshots.
Do not add production test hooks or enable the userscript on localhost.
Test-only changes do not require a userscript version bump.

The current userscript metadata and in-panel version are `1.17.3`. On each
release, keep `@version` and `VERSION` synchronized and retain both GitHub
update URLs. Tampermonkey updates only after a higher version is published to
the public `main` branch; a local commit alone does not publish an update.
Never put credentials in the script or update URLs.

Every user-facing version must also have authored release notes in
`releases/v<version>.md`; use `releases/v1.16.7.md` as the template. Include
the exact version heading, a `Changes` section with user-facing changes,
update instructions, and an honest validation summary. Add the notes in the
same PR as the version bump. Release validation runs in `npm test` and CI.
After successful tests on `main`, the workflow publishes the matching GitHub
Release and creates its tag at the tested commit if absent. Existing tags
are reused only when their userscript matches; published releases are never
overwritten. Test/documentation-only changes keep the current version.
If publishing fails, fix the cause and rerun `Validate userscripts` on `main`
using its manual trigger. Verify the published Release before considering a
user-facing version complete. Tampermonkey still updates from `main`, not
from the Release.

### Security review before release

- Every PR and push to `main` runs `node .github/security-audit.cjs` (also part
  of `npm test`) and `npm audit --audit-level=high`. The audit fails on changed
  privileged metadata (`@match`, `@grant`, update URLs, any `@connect`,
  `@require`, `@resource`), `eval`/`new Function`/string timers, dynamic
  `innerHTML`/`insertAdjacentHTML`, `fetch` outside `request()`, non-relative
  `request()` paths, unexpected absolute URLs, workflow actions not pinned to
  a full commit SHA, and obvious secrets in tracked files. Changing an allowed
  value requires a deliberate, reviewed edit of the audit script.
- GitHub secret scanning with push protection is enabled on the repository.
  Dependabot (`.github/dependabot.yml`) proposes monthly updates of the pinned
  actions and npm dev dependencies; keep the `# vX.Y.Z` comment in sync.
- PRs raising `@version` complete the release checklist in
  `.github/pull_request_template.md` and include a security review of
  `git diff v<previous>..HEAD`. File findings as issues labelled `security`.
- `main` is protected (required `test` check, strict, admins included, no force
  push or deletion). Tampermonkey auto-updates from `main`, so anyone able to
  merge there can run code in users' Jira sessions; keep merge rights minimal.

## History and repository safety

The timer originated as a direct Jira worklog alternative after trouble with
the Clockify Jira integration. Historical service diagnostics are not proof
of current Clockify status. Do not recreate live diagnostic writes.

Use new commits; do not rewrite repository history or amend commits by
default. Existing commit subjects use `feat:`, `fix:`, `refactor:`, and
`chore:`. Do not push without explicit permission. Do not copy credentials,
Jira HTML, browser storage, tokens, or API keys into the repository.
