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
  Navigation alone never switches timers.
- `STOP` stops and saves the tracked issue. `CANCEL` discards only the current
  unsaved timer; it never deletes a saved Jira worklog. Actions have no
  confirmation dialogs.
- `ADD MINUTES` accepts positive whole minutes and records against the open
  issue, ending at submission time. Enter submits as well as the button.
  Independent manual entry does not change a running timer; intervals can
  overlap, so users must avoid recording the same time twice.
- Elapsed time is based on wall-clock timestamps and refreshes every 100ms.
  Jira worklogs have a one-minute minimum; longer durations are rounded down
  to whole minutes.
- The 240px panel uses green for the open tracked issue, blue for a different
  tracked issue, and red when idle. Issue and title link to the tracked issue.
  The current issue's all-pages worklog total appears below the clock.
- Save/discard confirmations are transient, separate toasts. Saved toasts show
  recorded duration; discarded toasts show measured duration. Do not replay
  toasts from persisted data after reload.
- Preserve remaining estimate when posting worklogs. No timer operation should
  make an unrequested write to Jira.

## Persistence and recovery

- `jira-direct-timer-v1` in Jira-origin `localStorage` stores one timer shared
  across tabs in the same browser profile and Jira origin. It is not keyed by
  Jira account. Never clear or silently replace it.
- The base record contains `id`, `issue`, `started`, `ended`, and `phase`.
  Preserve compatibility with optional legacy fields including `title`,
  `nextIssue`, `manualNext`, `manual`, `worklogId`, `recordedSeconds`,
  `completedAt`, and `manualEntry`.
- Phases are `running`, `stopped`, `pending`, and `saved`. Persist `pending`
  before POST. Serialize mutations with `navigator.locks.request`; if locks
  are unavailable or busy, show an error rather than writing unsafely.
- Worklogs include `[jira-direct-timer:<id>]`. Before recovery, page through
  Jira worklogs looking for that exact marker. If found, confirm the save.
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

The current userscript metadata and in-panel version are `1.16.7`. On each
release, keep `@version` and `VERSION` synchronized and retain both GitHub
update URLs. Tampermonkey updates only after a higher version is published to
the public `main` branch; a local commit alone does not publish an update.
Never put credentials in the script or update URLs.

## History and repository safety

The timer originated as a direct Jira worklog alternative after trouble with
the Clockify Jira integration. Historical service diagnostics are not proof
of current Clockify status. Do not recreate live diagnostic writes.

Use new commits; do not rewrite repository history or amend commits by
default. Existing commit subjects use `feat:`, `fix:`, `refactor:`, and
`chore:`. Do not push without explicit permission. Do not copy credentials,
Jira HTML, browser storage, tokens, or API keys into the repository.
