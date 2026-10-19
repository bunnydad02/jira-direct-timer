# Jira direct timer: maintenance handoff

Prepared on 2026-10-19 from the source, tests, repository history and development
conversation. This document preserves project context for future maintainers.

## Current baseline and scope

- Repository: `C:\REPO\jira-direct-timer`; work on `master` as requested.
- Baseline before v1.14: `ad89abe`; working tree clean.
- Userscript version: **1.15.2**, standalone fixed panel at the bottom left.
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
- Successful saves and cancellation show separate toasts above the panel for
  5 seconds each, with HH:MM:SS, issue key and full title (linked as text).
  Saved toasts use recorded duration, discarded toasts use measured duration.
  The panel immediately resets to idle unless a timer is still running or
  unresolved work remains. Independent manual entry confirms its own issue
  without changing the running timer; switching confirms the old issue while
  showing the new timer. Do not delete saved storage to reset the display.
- Toasts are transient in the acting tab, not replayed from storage on reload.
  Keep separate toasts for successive saves, including queued recovery.
  Show success only after a confirmed/persisted save (also marker recovery),
  never on an uncertain result. Cancellation does not delete Jira worklogs.
- Toasts are calm white cards matching the panel's outer width (normally 240px),
  with content-driven height, subtle borders/shadows and full wrapping titles.
  Small sentence-case status headings/dots are green for saved, muted brown for
  discarded (not an error). Duration and issue key are separate flex items;
  wrap between them when necessary rather than breaking ordinary issue keys.
  The detail link has a spoken label retaining the save/discard relationship.
  Avoid saturated backgrounds, uppercase headings and competing bold text.
  Fade/slide in for
  0.5 seconds, hold for 4 seconds, fade/slide out for 0.5 seconds. Respect
  prefers-reduced-motion by disabling animation, keeping the 5-second lifetime.
- Toasts have no scroll container or height cap: use visible overflow so
  animations and shadows are not clipped. Multiple cards stack above the panel.
- Panel styles are defined only in the stylesheet. Do not duplicate them inline:
  inline background/border styles previously overrode running/other state colors.
  Node mocks do not verify CSS precedence; check computed colors in a browser.

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
- While a local action is busy, render a separate pre-action storage snapshot
  with controls disabled, not intermediate persisted save phases. This prevents
  recovery controls/status and panel colors from flashing on routine saves.
  Running time still advances (including independent manual entries).
  On completion/error, render actual persisted state immediately; recovery
  remains visible after failures and reloads. Never delay pending persistence.
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

The v1.15.2 save-transition fix was checked with a paused mock POST in a browser.
Before the fix, the pending render exposed recovery controls and grew the panel
from 276px to 368px. After the fix, height stayed at 276px and a MutationObserver
saw no recovery controls through successful completion. Simulated connection
loss still exposed the error and enabled recovery with pending state retained.
Regression tests force render during every GET/POST for STOP, switch and manual
saves (including queued work), checking stable status, controls and colors.

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
independent manual marker/reload recovery, both queued manual failure stages,
pending switch recovery with its original end time, saved worklog metadata,
cancellation,
titles/links, immediate idle after completion, independent save/discard toasts,
their recorded vs measured durations, and the 4999/5000ms expiry boundary.
They are not browser layout, real multi-tab contention or live API tests.

The v1.13 UI was also checked in an isolated localhost browser with mocked Jira
responses: an Enter keydown saved 20 minutes, the input cleared, and a subsequent
manual save preserved the running timer's ID/start/phase. No Jira worklogs were
created by this check. This does not validate the installed Tampermonkey copy.

The v1.14 toast UI was checked in an isolated localhost browser with mocked
Jira responses: manual 20 minutes on B preserved A's timer ID/start/phase,
the toast was positioned above the panel, save/discard colors and linked safe
text were checked, STOP/CANCEL reset the panel immediately, and toasts expired.
Browser animation samples verified opacity 0/0.5/1 during entry, a fully visible
4-second hold, and opacity 0.5/near-zero during exit. The 340px card constrained
to 280px in a 320px viewport, and reduced-motion mode disabled animation while
preserving expiry.
No real Jira worklogs were created. This does not validate the installed copy.
The inline panel background overriding state-based CSS was observed in v1.14;
v1.14.3 removes the duplicate inline styles to restore state colors.
An isolated browser comparison reproduced red backgrounds/borders in the old
running states and verified the fix: green on the open issue, blue on another,
red when idle/stopped/pending/saved, including clock colors and 240px width.

The v1.15 calmer toast was visually checked with the user's example title.
Mocked-browser assertions verified matching 240px/220px panel/toast widths,
unbroken ordinary issue keys, wrapping full titles, white surfaces, unchanged
animation timings, reduced motion, expiry and independent manual entry preserving
the running timer exactly. No real Jira worklogs were created.

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
- `cf72b0f`: historical standalone rollback/import plus support artifacts;
  included an inline panel-style assignment later removed in v1.14.3.
- `5f8c0c3`: removed old Clockify workaround, support-email draft and completed
  v1.7 text-editing worksheet. They remain retrievable in Git history.
- Use new commits; do not rewrite reconstructed history or amend by default.
  Existing convention: `feat:` and `chore:` subjects. Remain on `master` unless
  the user changes that instruction; do not push without a request.
- The help file describes current behavior only; use Git history for old labels,
  release notes and superseded UI variants.
- v1.13 implements the subsequent request for Enter submission, ADD MINUTES
  button text, uninterrupted timers during manual entries and accurate initial
  seconds. It does not revive the abandoned Clockify/sidebar experiment.
- v1.14 replaces the in-panel completion display with save/discard toasts,
  preserving ongoing measurements, recovery and stored duplicate protection.
- v1.15.1 unifies persisted save completion for POST and marker recovery,
  caches fixed panel nodes and reuses the selected issue across panel state checks.
  Static button labels no longer need rewriting every 100ms. The guide now
  describes current behavior instead of mixing usage with historical releases.
  Stored fields and legacy recovery paths are intentionally retained.
- Credentials/JWTs were shared in the original troubleshooting chat. Do not
  copy raw chat, Jira HTML, browser storage, tokens or API keys into Git.
  Previously shared Clockify credentials should be rotated by their owner;
  this handoff does not claim that rotation happened.
