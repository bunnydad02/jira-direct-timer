# Jira Local Workspace - Worklog timer

This project contains a standalone Tampermonkey timer for logging time directly
to Jira. It runs locally in the browser and requires no server plugin, API key,
or external account. It is not connected to Clockify.

## Installation

1. Open the existing Jira timer in Tampermonkey, or create a new script for a
   first installation.
2. Replace its entire contents with
   [jira-workspace-timer.user.js](./jira-workspace-timer.user.js) and save.
3. Allow Tampermonkey access to `https://jira.alza.cz/*` and refresh Jira.
4. When updating, do not install a second copy or clear site data; an unfinished
   timer remains available.

Update metadata points to the file on the public GitHub `main` branch.
Tampermonkey offers an update when the published version exceeds the installed
one. For each release, update both `@version` and `VERSION` in the userscript.
Update settings are in Tampermonkey Dashboard -> Settings -> Script Update.
Never put an access token in the script or URLs.

## Releases and changes

Each user-facing version has a [GitHub Release](https://github.com/bunnydad02/jira-direct-timer/releases)
with readable release notes, not just a Git tag.

For a release, increment `@version` and `VERSION` and add
`releases/v<version>.md` in the same PR, following [v1.16.7](./releases/v1.16.7.md).
Describe the actual user-facing changes, update instructions and validation.
CI requires notes for the current version, a matching heading and `Changes`
section. Since 1.17.4 the notes must also contain `## Screenshots` with relevant
images such as `![description](../docs/screenshots/<state>.png)`. Publishing
pins those links to the version tag. After merging to `main` and successful
regressions, CI publishes the tag and Release. Documentation-only and test-only
changes do not require a new version or overwrite published Releases.

If publication fails, fix the cause and rerun `Validate userscripts` on `main`
in GitHub Actions. Reruns do not duplicate releases or move existing tags.
The release is complete only after verifying the published Release.
Tampermonkey updates from `main`; GitHub Releases document published versions.

## Usage

- `START` starts the open issue. If another timer is running, its work log is
  saved first and the new timer starts at its end time, without an API delay gap.
- Navigation alone does not switch timers. `STOP` saves the tracked issue;
  `CANCEL` discards only the unsaved timer.
- `ADD MINUTES` logs positive whole minutes to the open issue, by button or
  Enter, without changing a running timer. Zero or blank (including favorite
  `+min`) logs nothing and shows an "Added 0 minutes" toast.
- On `/browse/<KEY>`, the open issue always comes from the URL; `selectedIssue`
  applies only on boards and backlogs.
- `auto` opens automatic work logging settings. When enabled, issue creation
  through the Jira page logs the configured minutes (default 10), including
  Sub-task Bugs through Jira forms or REST. A valid key must be returned.
  AUTO is off by default, does not alter a running timer and cannot observe
  creation outside this page. Its indicator is bold green with a filled dot
  when enabled, gray with a hollow dot when disabled, and red `auto !` for
  corrupted settings; the tooltip shows the configured minutes.
- The `favorites N` chip opens up to 10 favorites. Each shows its title,
  project name and key. The `⋯` menu edits a local custom name including emoji,
  restores the original or removes the favorite; Jira itself is unchanged.
  Use the keyboard to enter emoji (Windows: `Win + .`). A project loading
  failure shows the project key and error, with retry in the menu.
  `+min` logs minutes to that issue; `▶` starts it even when not open and
  closes the list; `■` stops a running favorite. `+` opens search: clicking a
  result opens it in a new tab, while its `+` adds it. Search is disabled with
  an explanation when the list is full.
- The panel shows only the signed-in user's work logs for the open issue,
  across all pages. When subtasks have different total seconds, the personal
  total including subtasks follows in parentheses, e.g. `Logged so far: 2h
  (3.5h)`. Both values are rounded to tenths of an hour; exact seconds determine
  whether the second is shown. Identity, author and work log errors are shown
  instead of an inaccurate total.
- The old Clockify section is hidden, not uninstalled or controlled. Stop
  competing timers first to avoid logging the same time twice.

## Recovery and data safety

State is stored in Jira-origin `localStorage` and shared between tabs in the
same browser profile. Do not clear site data or switch Jira users while timing
or saving is unfinished.

Work logs are saved directly to Jira without changing the remaining estimate.
The minimum is one minute; longer intervals are rounded down to whole minutes.
An uncertain POST is not automatically repeated. Use Save / Verify; if Jira
cannot find the marker, inspect the Jira Work log manually before sending the
same time again.

See [jira-workspace-help.txt](./jira-workspace-help.txt) and
[HANDOFF.md](./HANDOFF.md) for detailed guidance and maintenance invariants.

## Development and testing

From the project root, without installing dependencies:

```powershell
node --check .\jira-workspace-timer.user.js
node .\jira-workspace-timer.test.cjs
```

These Node tests simulate Jira responses; they do not contact Jira or create
real work logs.

### Interactive local playground

Use Node.js 20 or newer for test tools. The Tampermonkey script itself still
requires no dependencies or server.

```powershell
npm run playground
```

Open `http://127.0.0.1:4173`. No dependencies are required for the playground.
The real production panel runs at bottom left. Switch between `DEMO-101` and
`DEMO-103`, advance time, and try START, STOP, CANCEL and ADD MINUTES (including
Enter). Simulated work logs, state and API requests appear beside the panel.
Reload, a failure before saving and a lost response after saving can be
simulated. **Run all regression scenarios** shows each result and exercises the
real panel.

Everything stays in page memory, not real `localStorage`. A simulated reload
preserves memory; a real refresh or reset discards it. The loopback server
rejects writes, CSP blocks network connections and panel links are intercepted
locally. No Jira account or Tampermonkey is needed. Stop the server with Ctrl+C.

### Automated browser regressions

```powershell
npm ci
npx playwright install chromium
npm test
```

`npm test` runs Node regressions, release checks, the security audit
(`npm run audit:security`), Chromium scenarios and screenshot generation.
For browser tests only use `npm run test:browser`; they start their own server
and require port 4173 to be free. Scenarios are shared with the playground and
cover layout, text, links, version, clock, switching, work logs, rounding,
manual entries, toasts, reload, slow API, double clicks, totals, errors,
marker recovery, legacy queues, locks and storage events. Tampermonkey, not the
timer, checks for updates.

CI runs Node and browser checks for pull requests and changes to `main`, and
attaches a screenshot and Playwright trace on browser failures.

### State screenshots

The [screenshot gallery](./docs/screenshots/README.md) shows timer states and
features. `npm test` regenerates it at the end (`npm run screenshots`) using
local mocks and fixed time, rewriting only visually changed images. Commit
changed PNGs so GitHub shows before/after comparisons; Git history and release
tags preserve older appearances. Add new states to
[tests/screenshots.visual.cjs](./tests/screenshots.visual.cjs). CI also
attaches a Linux set as `screenshots-linux`.
