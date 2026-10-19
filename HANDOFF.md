# Jira direct timer: maintenance handoff

Prepared on 2026-10-19 from the source, tests, repository history and development
conversation. This document preserves project context for future maintainers.

## Current baseline and scope

- Repository: `C:\REPO\jira-direct-timer`; work on `master` as requested.
- Baseline before v1.13: `14a43d9` (maintenance handoff); working tree clean.
- Userscript version: **1.13**, standalone fixed panel at the bottom left.
- Target: authenticated `https://jira.alza.cz`, historically identified as Jira
  Data Center 8.20.10. No current server-version recheck was performed.
- No package manager, bundler, server, Clockify account or API key is needed.
- Files: `jira-direct-timer.user.js` (implementation),
  `jira-direct-timer.test.cjs` (Node regression tests),
  `jira-direct-timer-help.txt` (installation, usage and release notes).
- The user requested only files useful for maintenance or development remain.
  Do not restore discarded diagnostic files just for completeness.

## Why this exists

On 2026-10-15 the Clockify integration in Jira could not connect to
`wss://stomp.clockify.me`. Diagnostics found TCP 443 refused there, whereas
`websockets.clockify.me` accepted a WebSocket connection. A separate userscript
redirected the hostname and let the integration panel load.

That workaround did not solve the whole integration. Authenticated integration
reads returned HTTP 200, but `/api/stopwatch/start` did not complete during
observed attempts. One attempt was deliberately aborted after 15 seconds:
that cancellation was not a server response. Later Clockify API diagnostics
reported HTTP 429 and a Free-plan quota of 30 requests per hour. This does not
establish the quota as the root cause of the pending integration request.
Account/workspace identity had been checked against the Jira integration.

The chosen solution was an independent browser timer saving directly into Jira
worklogs. It does not synchronize with Clockify or control its timers. Users
must avoid running competing timers or recording the same time twice.
These are historical findings, not proof of Clockify's current service status.

## User decisions to preserve

- `START` starts on the open issue. If another issue is tracked, it saves that
  timer before starting the selected issue. Navigation alone does not switch.
- `STOP` stops and saves the tracked issue, never starts a different timer.
- `CANCEL` is available only while running, discards that unsaved timer without
  a worklog POST, and does not modify already saved Jira worklogs.
- Actions intentionally have no confirmation dialogs.
- `ADD MINUTES` has no default example. Positive whole minutes are recorded
  against the open issue, ending at submission time, by button or Enter in the
  input. Clear the input on success. An existing running timer keeps its ID,
  start and running state, even when adding minutes to a different issue.
  These independent intervals may overlap; no timer worklog is posted.
- Display elapsed time from zero using wall-clock timestamps, refreshed every
  100ms to avoid a visibly prolonged first second. Keep the one-minute worklog
  minimum separate from the displayed elapsed duration.
- Minimum recorded duration is 60 seconds even for a shorter measurement.
  Longer measurements are rounded down to complete minutes. Rapid switching
  can consequently record more time than the wall-clock interval.
- Panel width is 240px; elapsed time is prominent. Intended states are green
  for the open tracked issue, blue for a different tracked issue, red otherwise.
  Issue identifiers and complete titles link to the tracked issue without
  ordinary blue, underlined link styling or a separate printed URL.
- Successful save confirmation is visible for 5 seconds, then the display
  resets to idle. Do not delete saved storage merely to reset the display.
- The current source also sets panel styles inline. Node mocks do not verify
  actual CSS precedence or rendered colors; check browser styling when changing it.

## Explicitly abandoned experiment

An experiment mounted the replacement inside `#timer-sidebar .mod-content`,
hid the Clockify iframe, changed its `src` to `about:blank`, and used a
MutationObserver to remount on Jira updates. It was not browser-verified.
The user explicitly stopped this work and requested the stable standalone
panel. Mount/restore/observer code was removed. Do not resume this integration
without a new user request; it is not pending work to finish automatically.

## Architecture and data safety

- Single top-level-page IIFE, `document-idle`, no userscript grants; prevents
  duplicate initialization with the panel ID `jira-direct-timer`.
- Persistent key: `jira-direct-timer-v1` in this Jira origin's `localStorage`.
  It is one timer per browser profile and origin, shared across its tabs,
  not across devices/profiles. Do not change keys or erase state casually.
- Base record: `id`, `issue`, `started` (epoch ms), `ended` (ms or null),
  `phase`; optional `title`, `nextIssue`, `manualNext`, `manual`, `worklogId`,
  `recordedSeconds`, `completedAt`, `manualEntry`. Preserve compatibility with
  old records.
- Phases: `running`, `stopped`, `pending`, `saved`. Mark and persist `pending`
  before issuing the worklog POST. A lost response leaves an uncertain result.
- Before saving, `findSaved` pages through issue worklogs looking for
  `[jira-direct-timer:<id>]` in the comment. Never remove/change that marker.
- If a pending record is found remotely, recover it as saved. If it is absent,
  show an explicit error: **do not retry the POST automatically**. Check Jira
  manually rather than risking a duplicate. Errors must remain visible.
- `nextIssue` preserves switch intent; the new timer starts at the old end time
  after saving succeeds. `manualNext` preserves queued manual work across failures.
  Do not throw away either intent during recovery or start competing work.
- `manualEntry` nests an independent manual record inside the running timer.
  Persist every manual save phase through the parent, keeping the timer running.
  Remove this child only after a confirmed save. Ulozit / Overit recovers this
  child without stopping the timer or repeating an uncertain POST, including
  after reload. While unresolved, block stop/cancel/switch/new manual entry so
  no action can overwrite it. Legacy `manualNext` recovery remains supported for
  old stopped/saved records; already stopped timers are still saved first.
- `navigator.locks.request` serializes mutations across tabs, with `ifAvailable`.
  Unsupported/busy locks produce visible errors instead of unsafe writes.
- REST requests use the existing Jira session (`credentials: same-origin`).
  Worklogs use `/rest/api/2/issue/{key}/worklog?adjustEstimate=leave`; preserve
  the remaining estimate. No API secrets belong in the userscript.
- Issue selection precedence: `selectedIssue` query parameter, `/browse/{key}`,
  then `meta[name="ajs-issue-key"]`. Title comes from stored data, `#summary-val`,
  or a summary-only issue API read. Insert issue titles as text, not HTML.
- Keep the same Jira user during unfinished work; storage is not account-keyed.
  Do not clear site data, change profiles, or "repair" data by silently resetting.

## Validation and deployment

From the repository directory on Windows:

```powershell
node --check .\jira-direct-timer.user.js
node .\jira-direct-timer.test.cjs
```

Tests use Node built-ins (`fs`, `vm`, `assert`) and simulate DOM, storage,
time, locks and fetch. They do not contact Jira or create real worklogs.
They cover switching, minimum duration, manual input validation, Enter, an
uninterrupted timer on the same/other issue, simulated slow API, first-second
boundaries, both legacy network-failure stages, uncertain-write non-retry,
independent manual marker/reload recovery, queued work recovery, cancellation,
titles/links and the 4999/5000ms boundary.
They are not browser layout, real multi-tab contention or live API tests.

The v1.13 UI was also checked in an isolated localhost browser with mocked Jira
responses: an Enter keydown saved 20 minutes, the input cleared, and a subsequent
manual save preserved the running timer's ID/start/phase. No Jira worklogs were
created by this check. This does not validate the installed Tampermonkey copy.

For UI changes, verify in an authenticated browser with care: start/stop/manual
entry can write real worklogs. Obtain authorization for new diagnostic entries.
Historical live diagnostics were performed; their issue and worklog identifiers are intentionally omitted. Do not recreate diagnostic writes.

Deployment is manual: replace the full installed Tampermonkey script with the
repository userscript, save, then reload Jira. A Git edit does not update an
already installed userscript. Preserve browser state during updates.

## History and continuation

- Versions 1.0 through 1.12 were recovered from successful original session edits
  and committed retrospectively on 2026-10-15. Author timestamps reflect original
  release completion; commit timestamps reflect reconstruction. Do not describe
  these as commits that already existed during initial development.
- `4e3834a`: original recovered v1.12 release snapshot.
- `cf72b0f`: current standalone rollback/import plus historical support artifacts;
  includes the inline panel-style assignment retained in the present source.
- `5f8c0c3`: removed old Clockify workaround, support-email draft and completed
  v1.7 text-editing worksheet. They remain retrievable in Git history.
- Use new commits; do not rewrite reconstructed history or amend by default.
  Existing convention: `feat:` and `chore:` subjects. Remain on `master` unless
  the user changes that instruction; do not push without a request.
- The help file mixes historical labels with present-day usage (for example
  old "Prepnout" / "Zastavit a ulozit" vs current `START` / `STOP`). Treat the
  implementation and tests as current behavior; clarify the guide when editing it.
- v1.13 implements the subsequent request for Enter submission, ADD MINUTES
  button text, uninterrupted timers during manual entries and accurate initial
  seconds. It does not revive the abandoned Clockify/sidebar experiment.
- Credentials/JWTs were shared in the original troubleshooting chat. Do not
  copy raw chat, Jira HTML, browser storage, tokens or API keys into Git.
  Previously shared Clockify credentials should be rotated by their owner;
  this handoff does not claim that rotation happened.
