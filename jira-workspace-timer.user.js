// ==UserScript==
// @name         Jira Local Workspace - Worklog timer
// @namespace    alza.jira-direct-timer
// @version      1.20.0
// @updateURL    https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-timer.user.js
// @downloadURL  https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-timer.user.js
// @description  Persistent stopwatch that saves directly to Jira and hides the legacy Clockify panel.
// @match        https://jira.alza.cz/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.top !== window || document.getElementById('jira-direct-timer')) return;
    const KEY = 'jira-direct-timer-v1';
    const AUTO_SETTINGS_KEY = 'jira-direct-timer-auto-settings-v1';
    const AUTO_QUEUE_KEY = 'jira-direct-timer-auto-queue-v1';
    const FAVORITES_KEY = 'jira-direct-timer-favorites-v1';
    const FAVORITES_LIMIT = 10;
    const ISSUE_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;
    const VERSION = '1.20.0';
    const panel = document.createElement('section');
    panel.id = 'jira-direct-timer';
    const styles = document.createElement('style');
    styles.textContent = `
        #timer-sidebar {display:none!important}
        #jira-direct-timer {position:fixed;left:20px;bottom:20px;z-index:10000;width:240px;max-width:calc(100vw - 40px);box-sizing:border-box;padding:14px;border:1px solid #e4b9b9;border-radius:12px;background:#fff2f2;color:#253249;box-shadow:0 6px 24px #172b4d24;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #jira-direct-timer[data-running="true"] {background:#effaf2;border-color:#a6d8b4}
        #jira-direct-timer[data-other="true"] {background:#edf4ff;border-color:#9abce8}
        #jira-direct-timer strong {display:block;font-size:12px;font-weight:600;color:#526078;margin-bottom:10px}
        #jira-direct-timer [data-header] {display:flex;align-items:center;gap:6px;margin-bottom:10px}
        #jira-direct-timer [data-header] strong {margin:0}
        #jira-direct-timer [data-version-wrap] {margin-left:auto;font-size:9px;font-weight:400;line-height:1.45;color:inherit}
        #jira-direct-timer [data-fav-open] {display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border:1px solid #b9c4d2;border-radius:9px;background:#ffffffa0;color:#526078;font-size:9px;font-weight:600;line-height:1.45;white-space:nowrap}
        #jira-direct-timer [data-fav-open] b {color:#253249}
        #jira-direct-timer [data-fav-open][data-state="error"],#jira-direct-timer [data-fav-open][data-state="error"] b {color:#ae2a19}
        #jira-direct-timer [data-favorites] {display:grid;grid-template-rows:1fr;margin:-4px 0 9px;padding-bottom:7px;border-bottom:1px solid #172b4d20;transition:grid-template-rows .45s ease,opacity .45s ease,margin .45s ease,padding .45s ease,border-color .45s ease}
        #jira-direct-timer [data-fav-body] {min-width:0;min-height:0}
        #jira-direct-timer [data-favorites][data-closing] {grid-template-rows:0fr;opacity:0;margin-bottom:0;padding-bottom:0;border-bottom-color:transparent}
        #jira-direct-timer [data-favorites][data-closing] [data-fav-body] {overflow:hidden}
        #jira-direct-timer [data-fav-header] {display:flex;align-items:center;gap:4px;min-height:18px;margin-bottom:2px}
        #jira-direct-timer [data-fav-heading] {flex:1;color:#526078;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase}
        #jira-direct-timer [data-fav-header] button {display:inline-flex;flex-shrink:0;width:18px;height:18px;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:#526078;font-size:14px;font-weight:400;line-height:1}
        #jira-direct-timer [data-fav-list] {max-height:45vh;overflow-y:auto}
        #jira-direct-timer [data-fav-row] {position:relative;display:grid;grid-template-columns:1fr 54px 52px;gap:5px;padding:8px 0;border-top:1px solid #172b4d12;border-radius:3px;transition:background-color .6s ease}
        #jira-direct-timer [data-fav-row][data-fresh] {background:#e3f4e8}
        #jira-direct-timer a[data-fav-info] {display:block;grid-column:1/-1;min-width:0;line-height:1.3;color:inherit;text-decoration:none;overflow-wrap:anywhere}
        #jira-direct-timer a[data-fav-info]:hover [data-fav-summary] {text-decoration:underline}
        #jira-direct-timer [data-fav-key] {display:block;color:#526078;font-size:10px}
        #jira-direct-timer [data-fav-dot] {margin-right:3px;color:#20559a}
        #jira-direct-timer [data-fav-summary] {display:block;color:#253249;font-size:13px;font-weight:700}
        #jira-direct-timer [data-fav-minutes] {grid-row:2;grid-column:2;min-height:36px;padding:0 4px;font-size:11px}
        #jira-direct-timer [data-fav-start],#jira-direct-timer [data-fav-stop] {grid-row:2;grid-column:3;min-height:36px;padding:0;font-size:15px;color:#fff}
        #jira-direct-timer [data-fav-start] {background:#176538;border-color:#176538}
        #jira-direct-timer [data-fav-stop] {background:#a73434;border-color:#a73434}
        #jira-direct-timer [data-fav-menu-toggle] {grid-row:2;grid-column:1;justify-self:start;min-width:36px;min-height:36px;padding:0;font-size:18px}
        #jira-direct-timer [data-fav-menu] {grid-column:1/-1;display:grid;gap:4px;padding:6px;border:1px solid #b9c4d2;border-radius:6px;background:#fff}
        #jira-direct-timer [data-fav-menu] button {text-align:left;min-height:36px}
        #jira-direct-timer [data-fav-name-editor] {display:grid;gap:7px;margin:2px 0 6px;padding:8px;border:1px solid #dfe3e8;border-radius:7px;background:#fff}
        #jira-direct-timer [data-fav-name-input] {width:100%;height:36px}
        #jira-direct-timer [data-fav-name-hint] {font-size:10px;color:#526078;overflow-wrap:anywhere}
        #jira-direct-timer [data-fav-name-actions] {display:flex;flex-wrap:wrap;gap:4px}
        #jira-direct-timer [data-fav-name-actions] button {min-height:34px}
        #jira-direct-timer [data-fav-editor] {display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin:2px 0 6px;padding:8px;border:1px solid #dfe3e8;border-radius:7px;background:#fff}
        #jira-direct-timer [data-fav-editor-row] {display:flex;align-items:center;gap:6px}
        #jira-direct-timer [data-fav-quick] {flex:1;height:24px;padding:0 6px;font-size:10px}
        #jira-direct-timer [data-fav-minutes-input] {flex:1;width:0;height:26px;padding:0 8px;font-size:12px;-moz-appearance:textfield}
        #jira-direct-timer [data-fav-minutes-input]::-webkit-inner-spin-button,#jira-direct-timer [data-fav-minutes-input]::-webkit-outer-spin-button {margin:0;-webkit-appearance:none}
        #jira-direct-timer [data-fav-minutes-save] {height:26px;padding:0 10px;border-color:#176538;background:#176538;color:#fff;font-size:10px}
        #jira-direct-timer [data-fav-body] input:focus-visible {outline:0;border-color:#0052cc;box-shadow:0 0 0 2px #0052cc33}
        #jira-direct-timer [data-fav-search-wrap] {position:relative;margin-top:2px}
        #jira-direct-timer [data-fav-search] {display:block;width:100%;height:26px;padding:0 24px 0 7px;border-color:#4c8be0;font-size:11px}
        #jira-direct-timer [data-fav-search]:disabled {border-color:#b9c4d2;background:#f4f5f7;cursor:not-allowed}
        #jira-direct-timer [data-fav-search-close] {position:absolute;top:4px;right:4px;display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:transparent;color:#526078;font-size:13px;font-weight:400;line-height:1}
        #jira-direct-timer [data-fav-search-close]:not(:disabled):hover {background:#172b4d14;filter:none}
        #jira-direct-timer [data-fav-results] {position:absolute;top:calc(100% + 3px);left:0;right:0;z-index:3;max-height:200px;overflow:auto;border:1px solid #dfe3e8;border-radius:6px;background:#fff;box-shadow:0 6px 18px #172b4d2e}
        #jira-direct-timer [data-fav-result] {display:flex;align-items:center;gap:4px;padding:3px 4px 3px 6px;font-size:9px;line-height:1.35}
        #jira-direct-timer [data-fav-result] + [data-fav-result] {border-top:1px solid #172b4d10}
        #jira-direct-timer [data-fav-result] a {display:flex;flex:1;min-width:0;gap:4px;color:#253249;text-decoration:none}
        #jira-direct-timer [data-fav-result] a:hover {color:#0052cc;text-decoration:underline}
        #jira-direct-timer [data-fav-result] b {white-space:nowrap}
        #jira-direct-timer [data-fav-result] a span {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #jira-direct-timer [data-fav-result] i {color:#8993a4;font-size:8px;font-style:normal}
        #jira-direct-timer [data-fav-pin] {flex-shrink:0;width:18px;height:17px;padding:0;border-color:#176538;color:#176538;font-size:12px;line-height:1}
        #jira-direct-timer [data-fav-saved] {flex-shrink:0;color:#526078;font-size:8px;font-style:normal}
        #jira-direct-timer [data-fav-message] {padding:5px 7px;color:#526078;font-size:9px}
        #jira-direct-timer [data-fav-message][data-state="error"] {color:#ae2a19;white-space:pre-wrap;overflow-wrap:anywhere}
        #jira-direct-timer [data-fav-limit] {margin-top:4px;color:#ae2a19;font-size:9px;line-height:1.35}
        #jira-direct-timer [data-fav-empty] {padding:3px 0;color:#526078;font-size:9px}
        #jira-direct-timer [data-fav-error] {color:#ae2a19;font-size:9px;white-space:pre-wrap;overflow-wrap:anywhere}
        #jira-direct-timer [data-fav-error]:not(:empty) {margin-top:4px}
        #jira-direct-timer [data-version] {color:inherit;text-decoration:none;opacity:.55}
        #jira-direct-timer [data-version]:hover,#jira-direct-timer [data-version]:focus-visible {opacity:1;text-decoration:underline}
        #jira-direct-timer [data-clock] {display:block;font-size:34px;line-height:1.2;font-weight:750;letter-spacing:1px;font-variant-numeric:tabular-nums;color:#8d3030;margin:4px 0 8px}
        #jira-direct-timer[data-running="true"] [data-clock] {color:#176538}
        #jira-direct-timer[data-other="true"] [data-clock] {color:#20559a}
        #jira-direct-timer [data-worklog-total] {margin:-5px 0 8px;color:#526078;font-size:10px;line-height:1.4;overflow-wrap:anywhere}
        #jira-direct-timer [data-worklog-total][data-state="error"] {color:#ae2a19}
        #jira-direct-timer [data-measuring] {font-size:14px;font-weight:750;color:#20559a;overflow-wrap:anywhere}
        #jira-direct-timer a[data-issue],#jira-direct-timer a[data-title],#jira-direct-timer a[data-measuring] {display:block;color:inherit;text-decoration:none}
        #jira-direct-timer a[data-measuring] {color:#20559a}
        #jira-direct-timer a:focus-visible {outline:2px solid #0052cc;outline-offset:2px}
        #jira-direct-timer [data-issue] {font-weight:700;font-size:13px}
        #jira-direct-timer [data-title] {font-size:12px;margin-bottom:8px;overflow-wrap:anywhere}
        #jira-direct-timer [data-status] {font-size:11px;color:#526078;white-space:pre-wrap;overflow-wrap:anywhere}
        #jira-direct-timer [data-actions] {display:flex;gap:6px;margin-top:12px}
        #jira-direct-timer button {appearance:none;margin:0;padding:7px 8px;border:1px solid #b9c4d2;border-radius:6px;background:#fff;color:#253249;font-family:inherit;font-size:11px;font-weight:600;line-height:1.3;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
        #jira-direct-timer [data-actions] button {flex:1;min-width:0}
        #jira-direct-timer [data-start] {background:#176538;border-color:#176538;color:#fff}
        #jira-direct-timer [data-stop] {background:#a73434;border-color:#a73434;color:#fff}
        #jira-direct-timer button:disabled {opacity:.4;cursor:default}
        #jira-direct-timer button:not(:disabled):hover {filter:brightness(.93)}
        #jira-direct-timer button:focus-visible,#jira-direct-timer input:focus-visible {outline:2px solid #0052cc;outline-offset:2px}
        #jira-direct-timer [hidden] {display:none!important}
        #jira-direct-timer [data-save-row] {margin-top:8px}
        #jira-direct-timer [data-save] {width:100%}
        #jira-direct-timer [data-manual-row] {margin-top:12px;padding-top:10px;border-top:1px solid #172b4d20}
        #jira-direct-timer [data-manual-heading] {display:flex;align-items:center;justify-content:space-between;gap:8px}
        #jira-direct-timer label {display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;font-weight:700;letter-spacing:.4px}
        #jira-direct-timer input {box-sizing:border-box;width:70px;min-width:0;padding:6px;border:1px solid #b9c4d2;border-radius:6px;background:#fff;color:#253249;font-family:inherit;font-size:13px}
        #jira-direct-timer [data-manual] {width:100%;margin-top:7px}
        #jira-direct-timer [data-auto-open] {display:inline-flex;align-items:center;gap:4px;padding:2px 5px;border:0;background:transparent;color:#526078;font-size:9px;font-weight:500;white-space:nowrap}
        #jira-direct-timer [data-auto-open]::before {content:'';width:6px;height:6px;flex-shrink:0;box-sizing:border-box;border:1px solid currentColor;border-radius:50%}
        #jira-direct-timer [data-auto-open][data-state="on"] {color:#176538;font-weight:700}
        #jira-direct-timer [data-auto-open][data-state="on"]::before {background:currentColor}
        #jira-direct-timer [data-auto-open][data-state="error"] {color:#ae2a19;font-weight:700}
        #jira-direct-timer [data-auto-open][data-state="error"]::before {background:currentColor}
        #jira-direct-timer [data-auto-settings] {position:absolute;left:8px;right:8px;bottom:8px;z-index:2;padding:12px;border:1px solid #b9c4d2;border-radius:8px;background:#fff;box-shadow:0 4px 16px #172b4d30}
        #jira-direct-timer [data-auto-settings] header {display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-weight:700}
        #jira-direct-timer [data-auto-settings] header button {padding:1px 5px;border:0;font-size:14px}
        #jira-direct-timer [data-auto-enabled-label] {justify-content:flex-start;font-weight:500;letter-spacing:0}
        #jira-direct-timer [data-auto-enabled] {width:auto}
        #jira-direct-timer [data-auto-minutes-row] {margin-top:8px}
        #jira-direct-timer [data-auto-save],#jira-direct-timer [data-auto-retry] {width:100%;margin-top:9px}
        #jira-direct-timer [data-auto-error] {margin-top:7px;color:#ae2a19;font-size:10px}
        #jira-direct-timer [data-error] {color:#ae2a19;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}
        #jira-direct-timer [data-error]:not(:empty) {margin-top:8px}
        #jira-direct-timer [data-toasts] {position:absolute;left:-1px;right:-1px;bottom:calc(100% + 12px);display:flex;flex-direction:column;gap:10px;overflow:visible}
        #jira-direct-timer [data-toast] {padding:14px;border:1px solid #dfe3e8;border-radius:10px;background:#fff;color:#253249;box-shadow:0 4px 16px #172b4d18;font-size:12px;line-height:1.5;overflow-wrap:anywhere;animation:jira-direct-timer-toast 5s ease-in-out both}
        #jira-direct-timer [data-toast] strong {display:flex;align-items:center;gap:7px;margin-bottom:8px;color:#23734a;font-size:12px;font-weight:600;letter-spacing:0}
        #jira-direct-timer [data-toast] strong::before {content:'';width:7px;height:7px;flex-shrink:0;border-radius:50%;background:currentColor}
        #jira-direct-timer [data-toast="discarded"] strong {color:#8a6150}
        #jira-direct-timer [data-toast="empty"] strong {color:#526078}
        #jira-direct-timer [data-toast="empty"] span {display:block;color:#667085}
        #jira-direct-timer [data-toast] a {display:block;color:inherit;text-decoration:none}
        #jira-direct-timer [data-toast] strong + a {display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin-bottom:5px;font-variant-numeric:tabular-nums}
        #jira-direct-timer [data-toast-duration] {font-size:20px;font-weight:600;line-height:1.3;letter-spacing:-.4px;white-space:nowrap}
        #jira-direct-timer [data-toast-issue] {font-size:12px;font-weight:600;color:#526078}
        #jira-direct-timer [data-toast] a:last-child {color:#667085;font-size:12px;font-weight:400;line-height:1.5}
        @keyframes jira-direct-timer-toast {
            0% {opacity:0;transform:translateY(5px)}
            10%,90% {opacity:1;transform:translateY(0)}
            100% {opacity:0;transform:translateY(-3px)}
        }
        @media (prefers-reduced-motion:reduce) {
            #jira-direct-timer [data-toast] {animation:none}
            #jira-direct-timer [data-favorites],#jira-direct-timer [data-fav-row] {transition:none}
        }
    `;
    document.body.appendChild(styles);
    panel.innerHTML = '<div data-favorites hidden><div data-fav-body><div data-fav-header><span data-fav-heading></span><button data-fav-add>+</button><button data-fav-close></button></div><div data-fav-search-wrap hidden><input data-fav-search type="text" autocomplete="off"><button data-fav-search-close></button><div data-fav-results hidden></div></div><div data-fav-limit hidden role="status"></div><div data-fav-list></div><div data-fav-error role="alert"></div></div></div><div data-header><strong>Jira timer</strong><button data-fav-open><span data-fav-label></span><b data-fav-count></b></button><span data-version-wrap><a data-version></a></span></div><a data-measuring hidden></a><a data-issue></a><a data-title></a><time data-clock>00:00:00</time><div data-worklog-total hidden role="status" aria-live="polite"></div><div data-status></div><div data-actions><button data-start>START</button><button data-stop>STOP</button></div><div data-save-row><button data-save></button></div><div data-error role="alert"></div>';
    const versionLink = panel.querySelector('[data-version]');
    versionLink.textContent = `v${VERSION}`;
    versionLink.setAttribute('href', 'https://github.com/bunnydad02/jira-direct-timer');
    versionLink.setAttribute('target', '_blank');
    versionLink.setAttribute('rel', 'noopener noreferrer');
    versionLink.setAttribute('aria-label', `Timer version ${VERSION}; open GitHub repository`);
    document.body.appendChild(panel);
    const manualRow = document.createElement('div');
    manualRow.dataset.manualRow = '';
    manualRow.innerHTML = '<div data-manual-heading><label>ADD MINUTES <input data-minutes type="number" min="1" step="1"></label><button data-auto-open>auto</button></div><button data-manual>ADD MINUTES</button>';
    panel.appendChild(manualRow);
    const autoSettingsDialog = document.createElement('div');
    autoSettingsDialog.dataset.autoSettings = '';
    autoSettingsDialog.hidden = true;
    autoSettingsDialog.setAttribute('role', 'dialog');
    autoSettingsDialog.setAttribute('aria-modal', 'true');
    autoSettingsDialog.setAttribute('aria-label', 'Automatic work logging');
    autoSettingsDialog.innerHTML = '<header><span data-auto-heading></span><button data-auto-close>x</button></header><label data-auto-enabled-label><input data-auto-enabled type="checkbox"><span data-auto-enabled-text></span></label><label data-auto-minutes-row>Minutes <input data-auto-minutes type="number" min="1" step="1"></label><button data-auto-save></button><button data-auto-retry hidden></button><div data-auto-error role="alert"></div>';
    panel.appendChild(autoSettingsDialog);
    const toasts = document.createElement('div');
    toasts.dataset.toasts = '';
    toasts.setAttribute('role', 'status');
    toasts.setAttribute('aria-live', 'polite');
    panel.appendChild(toasts);
    const status = panel.querySelector('[data-status]');
    const error = panel.querySelector('[data-error]');
    const measuring = panel.querySelector('[data-measuring]');
    const issueLink = panel.querySelector('[data-issue]');
    const titleLink = panel.querySelector('[data-title]');
    const clock = panel.querySelector('[data-clock]');
    const worklogTotal = panel.querySelector('[data-worklog-total]');
    const saveRow = panel.querySelector('[data-save-row]');
    const start = panel.querySelector('[data-start]');
    const stop = panel.querySelector('[data-stop]');
    const cancel = document.createElement('button');
    cancel.dataset.cancel = '';
    cancel.textContent = 'CANCEL';
    cancel.hidden = true;
    stop.after(cancel);
    const save = panel.querySelector('[data-save]');
    const minutes = panel.querySelector('[data-minutes]');
    const manual = panel.querySelector('[data-manual]');
    const autoOpen = panel.querySelector('[data-auto-open]');
    const autoClose = autoSettingsDialog.querySelector('[data-auto-close]');
    const autoEnabled = autoSettingsDialog.querySelector('[data-auto-enabled]');
    const autoMinutes = autoSettingsDialog.querySelector('[data-auto-minutes]');
    const autoSave = autoSettingsDialog.querySelector('[data-auto-save]');
    const autoRetry = autoSettingsDialog.querySelector('[data-auto-retry]');
    const autoError = autoSettingsDialog.querySelector('[data-auto-error]');
    save.textContent = 'Save to Jira work log';
    autoOpen.setAttribute('aria-label', 'Open AUTO settings');
    autoSettingsDialog.querySelector('[data-auto-heading]').textContent = 'Automatic work logging';
    autoClose.setAttribute('aria-label', 'Close without saving');
    autoSettingsDialog.querySelector('[data-auto-enabled-text]').textContent = 'When creating an issue, log';
    autoSave.textContent = 'Save';
    autoRetry.textContent = 'Process pending entries';
    const favoritesSection = panel.querySelector('[data-favorites]');
    const favOpen = panel.querySelector('[data-fav-open]');
    const favCount = panel.querySelector('[data-fav-count]');
    const favAdd = panel.querySelector('[data-fav-add]');
    const favClose = panel.querySelector('[data-fav-close]');
    const favSearchWrap = panel.querySelector('[data-fav-search-wrap]');
    const favSearch = panel.querySelector('[data-fav-search]');
    const favSearchClose = panel.querySelector('[data-fav-search-close]');
    const favResults = panel.querySelector('[data-fav-results]');
    const favLimit = panel.querySelector('[data-fav-limit]');
    const favList = panel.querySelector('[data-fav-list]');
    const favError = panel.querySelector('[data-fav-error]');
    panel.querySelector('[data-fav-label]').textContent = 'favorites';
    panel.querySelector('[data-fav-heading]').textContent = 'Favorites';
    favAdd.setAttribute('aria-label', 'Add issue to favorites');
    favAdd.setAttribute('title', 'Add issue to favorites');
    favClose.textContent = '\u00d7';
    favClose.setAttribute('aria-label', 'Close favorites');
    favClose.setAttribute('title', 'Close favorites');
    favSearch.setAttribute('placeholder', 'Search: key or title');
    favSearch.setAttribute('aria-label', 'Search for a favorite issue');
    favSearchClose.textContent = '\u00d7';
    favSearchClose.setAttribute('aria-label', 'Close search');
    favSearchClose.setAttribute('title', 'Close search');
    let favoritesOpen = false;
    let favoritesClosing = false;
    let favoritesSignature = '';
    let favMessage = '';
    let favSearchOpen = false;
    let favSearchState = 'idle';
    let favSearchItems = [];
    let favSearchSeq = 0;
    let favSearchTimer = null;
    let favEditKey = null;
    let favEditValue = '';
    let favEditInvalid = false;
    let favFocusEditor = false;
    let favMenuKey = null;
    let favNameKey = null;
    let favNameValue = '';
    let favFocusName = false;
    let favFocusMenu = false;
    let favFocusToggle = null;
    let favHighlight = null;
    let busy = false;
    let actionDisplay = null;
    let displayedIssue = null;
    let notice = '';
    const titles = new Map();
    const titleRequests = new Set();
    const favoriteProjects = new Map();
    const worklogTotals = new Map();
    let notifications = [];
    let autoSettingsValue;
    let autoSettingsBroken = false;
    let autoBusy = false;
    const MANUAL_PENDING = 'First complete the pending manual entry using Save / Verify.';

    // render() runs every 100ms; writing unchanged values would still emit DOM mutations that wake Jira's observers.
    function update(target, key, value) {
        if (target[key] !== value) target[key] = value;
    }
    function updateAttr(node, name, value) {
        if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    }
    function browseUrl(key) {
        return `https://jira.alza.cz/browse/${encodeURIComponent(key)}`;
    }
    function validMinuteCount(count) {
        return Number.isSafeInteger(count) && count >= 1 && Number.isSafeInteger(count * 60000) &&
            Number.isFinite(new Date(Date.now() - count * 60000).getTime());
    }
    function parseMinutes(raw) {
        return /^\d+$/.test(raw) && validMinuteCount(Number(raw)) ? Number(raw) : null;
    }

    function renderAutoIndicator() {
        const state = autoSettingsBroken ? 'error' : autoSettingsValue.enabled ? 'on' : 'off';
        const label = {
            on: `AUTO on: ${autoSettingsValue.minutes} min per new issue`,
            off: 'AUTO off',
            error: 'AUTO settings are corrupted'
        }[state];
        update(autoOpen.dataset, 'state', state);
        update(autoOpen, 'textContent', state === 'error' ? 'auto !' : 'auto');
        updateAttr(autoOpen, 'aria-label', `${label}. Open AUTO settings`);
        updateAttr(autoOpen, 'title', label);
    }

    function readAutoSettings() {
        autoSettingsBroken = true;
        const raw = localStorage.getItem(AUTO_SETTINGS_KEY);
        if (!raw) {
            autoSettingsBroken = false;
            return {enabled: false, minutes: 10};
        }
        const value = JSON.parse(raw);
        if (!value || typeof value.enabled !== 'boolean' || !validMinuteCount(value.minutes)) {
            throw new Error('Automatic work logging settings are corrupted. Fix them in AUTO settings.');
        }
        autoSettingsBroken = false;
        return value;
    }

    function readAutoQueue() {
        const raw = localStorage.getItem(AUTO_QUEUE_KEY);
        if (!raw) return [];
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries) || entries.some(value =>
            !value || value.automatic !== true || typeof value.id !== 'string' ||
            !ISSUE_PATTERN.test(value.issue) || value.id !== `auto-${value.issue}` ||
            !Number.isFinite(value.started) || !Number.isFinite(value.ended) || value.ended < value.started ||
            !['stopped', 'pending', 'saved'].includes(value.phase))) {
            throw new Error('The automatic work log queue is corrupted. Do not delete the data; it needs inspection.');
        }
        return entries;
    }

    function writeAutoQueue(entries) {
        localStorage.setItem(AUTO_QUEUE_KEY, JSON.stringify(entries));
    }

    function persistAutoEntry(value) {
        const entries = readAutoQueue();
        const index = entries.findIndex(entry => entry.id === value.id);
        if (index < 0) throw new Error('The automatic work log disappeared from the queue. The entry was not retried.');
        entries[index] = value;
        writeAutoQueue(entries);
    }

    function removeAutoEntry(id) {
        writeAutoQueue(readAutoQueue().filter(entry => entry.id !== id));
    }

    function formatDuration(seconds) {
        return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
    }
    function formatLoggedHours(seconds) {
        const tenths = Math.round(seconds / 360);
        const hours = Math.floor(tenths / 10);
        const decimal = tenths % 10;
        return `${hours}${decimal ? `.${decimal}` : ''}h`;
    }
    function addToast(kind, heading, ...children) {
        const node = document.createElement('div');
        node.dataset.toast = kind;
        node.appendChild(favoriteNode('strong', '', heading));
        for (const child of children) node.appendChild(child);
        toasts.appendChild(node);
        return node;
    }
    function showToast(value, discarded = false) {
        const details = document.createElement('a');
        details.href = browseUrl(value.issue);
        const seconds = discarded ? duration(value) : value.recordedSeconds;
        details.setAttribute('aria-label', `${formatDuration(seconds)} ${discarded ? 'discarded from' : 'logged to'} issue ${value.issue}`);
        const elapsed = document.createElement('span');
        elapsed.dataset.toastDuration = '';
        elapsed.textContent = formatDuration(seconds);
        const key = document.createElement('span');
        key.dataset.toastIssue = '';
        key.textContent = value.issue;
        details.appendChild(elapsed);
        details.appendChild(key);
        const title = document.createElement('a');
        title.href = details.href;
        title.textContent = titleFor(value);
        const node = addToast(discarded ? 'discarded' : 'saved', discarded ? 'Discarded' : 'Recorded', details, title);
        notifications.push({node, title, value, expiresAt: Date.now() + 5000});
    }
    function renderToasts() {
        notifications = notifications.filter(notification => {
            if (Date.now() >= notification.expiresAt) {
                notification.node.remove();
                return false;
            }
            if (!notification.value) return true;
            const title = titleFor(notification.value);
            if (notification.title.textContent !== title) notification.title.textContent = title;
            return true;
        });
    }

    function titleFor(value) {
        if (value.title) return value.title;
        if (titles.has(value.issue)) return titles.get(value.issue);
        if (value.issue === issue()) {
            const summary = document.querySelector('#summary-val');
            if (summary && summary.textContent.trim()) {
                const title = summary.textContent.trim();
                titles.set(value.issue, title);
                return title;
            }
        }
        if (!titleRequests.has(value.issue)) {
            titleRequests.add(value.issue);
            request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}?fields=summary`)
                .then(body => {
                    if (typeof body.fields?.summary !== 'string') throw new Error('Jira did not return the issue title.');
                    titles.set(value.issue, body.fields.summary);
                    render();
                })
                .catch(e => {
                    notice = e.message;
                    render();
                });
        }
        return '';
    }
    function newTimer(key, started) {
        return {id: crypto.randomUUID(), issue: key, title: titleFor({issue: key}), started, ended: null, phase: 'running'};
    }
    const userIdentifiers = ['key', 'accountId', 'name'];
    function hasIdentifier(user, field) {
        return typeof user?.[field] === 'string' && user[field].trim() !== '';
    }
    function isOwnWorklog(worklog, user) {
        const field = userIdentifiers.find(field => hasIdentifier(user, field) && hasIdentifier(worklog.author, field));
        if (!field) throw new Error('Jira did not return the work log author identity.');
        return worklog.author[field] === user[field];
    }
    async function totalLoggedSeconds(key, user) {
        let offset = 0;
        let total = 0;
        let seconds = 0;
        do {
            const body = await request(`/rest/api/2/issue/${encodeURIComponent(key)}/worklog?startAt=${offset}&maxResults=100`);
            if (!Array.isArray(body.worklogs) || !Number.isSafeInteger(body.total) || body.total < 0) {
                throw new Error('Unexpected Jira work log response.');
            }
            total = body.total;
            for (const worklog of body.worklogs) {
                if (!Number.isSafeInteger(worklog.timeSpentSeconds) || worklog.timeSpentSeconds < 0) {
                    throw new Error('Jira returned an invalid work log duration.');
                }
                if (isOwnWorklog(worklog, user)) {
                    seconds += worklog.timeSpentSeconds;
                    if (!Number.isSafeInteger(seconds)) throw new Error('Jira returned an invalid work log total.');
                }
            }
            offset += body.worklogs.length;
            if (offset < total && !body.worklogs.length) {
                throw new Error('Jira did not return all work log entries.');
            }
        } while (offset < total);
        return seconds;
    }
    async function currentUser(consequence = '') {
        const user = await request('/rest/api/2/myself');
        if (!userIdentifiers.some(field => hasIdentifier(user, field))) {
            throw new Error(`Jira did not return the signed-in user identity.${consequence}`);
        }
        return user;
    }
    async function loggedTime(key) {
        const user = await currentUser();
        const seconds = await totalLoggedSeconds(key, user);
        const body = await request(`/rest/api/2/issue/${encodeURIComponent(key)}?fields=subtasks`);
        if (!Array.isArray(body.fields?.subtasks)) {
            throw new Error('Jira did not return the subtask list.');
        }
        let secondsWithSubtasks = seconds;
        const seen = new Set([key]);
        for (const subtask of body.fields.subtasks) {
            if (!ISSUE_PATTERN.test(subtask?.key) || seen.has(subtask.key)) {
                throw new Error('Jira returned an invalid subtask list.');
            }
            seen.add(subtask.key);
            secondsWithSubtasks += await totalLoggedSeconds(subtask.key, user);
            if (!Number.isSafeInteger(secondsWithSubtasks)) {
                throw new Error('Jira returned an invalid subtask time total.');
            }
        }
        return {seconds, secondsWithSubtasks};
    }
    function renderWorklogTotal(key) {
        update(worklogTotal, 'hidden', !key);
        if (!key) {
            update(worklogTotal, 'textContent', '');
            return;
        }
        let state = worklogTotals.get(key);
        if (!state) {
            state = {status: 'loading'};
            worklogTotals.set(key, state);
            loggedTime(key).then(totals => {
                if (worklogTotals.get(key) !== state) return;
                state.status = 'loaded';
                Object.assign(state, totals);
                render();
            }).catch(error => {
                if (worklogTotals.get(key) !== state) return;
                state.status = 'error';
                state.message = error.message;
                render();
            });
        }
        update(worklogTotal.dataset, 'state', state.status);
        let text = 'Logged so far: loading...';
        if (state.status === 'loaded') {
            text = `Logged so far: ${formatLoggedHours(state.seconds)}`;
            if (state.secondsWithSubtasks !== state.seconds) {
                text += ` (${formatLoggedHours(state.secondsWithSubtasks)})`;
            }
        } else if (state.status === 'error') {
            text = `Could not load logged time: ${state.message}`;
        }
        update(worklogTotal, 'textContent', text);
    }

    function read() {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || !ISSUE_PATTERN.test(value.issue) ||
            typeof value.id !== 'string' || !Number.isFinite(value.started) ||
            (value.ended !== null && (!Number.isFinite(value.ended) || value.ended < value.started)) ||
            !['running', 'stopped', 'pending', 'saved'].includes(value.phase)) {
            throw new Error('The saved timer state is corrupted. Do not delete the data; it needs inspection.');
        }
        return value;
    }
    function write(value) {
        localStorage.setItem(KEY, JSON.stringify(value));
    }
    function issue() {
        const meta = document.querySelector('meta[name="ajs-issue-key"]');
        const browsed = (location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/) || [])[1];
        // An issue page always targets its own key; selectedIssue applies only to boards and backlogs.
        const value = browsed || new URLSearchParams(location.search).get('selectedIssue') || meta && meta.content;
        return ISSUE_PATTERN.test(value || '') ? value : null;
    }
    function duration(value) {
        return Math.max(0, Math.floor(((value.ended === null ? Date.now() : value.ended) - value.started) / 1000));
    }
    function stamp(ms) {
        const date = new Date(ms);
        if (!Number.isFinite(date.getTime())) throw new Error('Invalid start time.');
        return date.toISOString().replace('Z', '+0000');
    }
    function render() {
        try {
            renderAutoIndicator();
            renderToasts();
            const value = busy ? actionDisplay : read();
            const currentIssue = issue();
            if (currentIssue !== displayedIssue) {
                displayedIssue = currentIssue;
                if (currentIssue) worklogTotals.delete(currentIssue);
            }
            renderWorklogTotal(currentIssue);
            const independentManual = value && value.manualEntry;
            const queuedManual = value && value.manualNext;
            const active = value && (value.phase !== 'saved' || queuedManual);
            const displayValue = value && value.phase !== 'saved' ? value : null;
            const seconds = displayValue ? duration(displayValue) : 0;
            const title = displayValue ? titleFor(displayValue) : '';
            const stateText = displayValue ? {running: '', stopped: 'Stopped, not yet saved', pending: 'Uncertain save result. Verify it using the button below.'}[displayValue.phase] : '';
            const running = !!value && value.phase === 'running';
            update(panel.dataset, 'running', String(running));
            const other = running && value.issue !== currentIssue;
            update(panel.dataset, 'other', String(other));
            update(measuring, 'hidden', !other);
            update(measuring, 'textContent', other ? `Currently tracking: ${value.issue}` : '');
            update(issueLink, 'textContent', displayValue ? displayValue.issue : '');
            update(issueLink, 'hidden', other || !displayValue);
            update(clock, 'textContent', formatDuration(seconds));
            update(titleLink, 'textContent', title);
            const href = displayValue ? browseUrl(displayValue.issue) : '';
            for (const link of [issueLink, titleLink, measuring]) {
                if (link.getAttribute('href') !== href) link.href = href;
            }
            let statusText = displayValue ? stateText : 'Nothing is being tracked.';
            if (queuedManual) statusText += `\nManual entry pending for ${queuedManual.issue}. Complete it using Save / Verify.`;
            if (independentManual) statusText += `\nManual entry pending for ${independentManual.issue}. Complete it using Save / Verify.`;
            update(status, 'textContent', statusText);
            const switching = active && value.issue !== currentIssue;
            update(start, 'disabled', busy || !currentIssue || !!queuedManual || !!independentManual || (!!active && !switching));
            update(stop, 'disabled', busy || !!independentManual || !running);
            update(cancel, 'hidden', !running);
            update(cancel, 'disabled', busy || !!independentManual || !running);
            update(save, 'disabled', busy || !value || (!['stopped', 'pending'].includes(value.phase) && !(value.phase === 'saved' && queuedManual) && !independentManual));
            update(saveRow, 'hidden', !value || (!['stopped', 'pending'].includes(value.phase) && !queuedManual && !independentManual));
            update(save, 'textContent', value && (value.phase === 'pending' || independentManual?.phase === 'pending') ? 'Verify previous entry (without retrying)' : 'Save to Jira work log');
            update(manual, 'disabled', busy || !currentIssue || !!queuedManual || !!independentManual || !!(value && value.phase === 'pending'));
            update(minutes, 'disabled', busy);
            update(error, 'textContent', notice);
            renderFavorites(value, false);
        } catch (e) {
            update(panel.dataset, 'running', 'false');
            update(panel.dataset, 'other', 'false');
            for (const control of [start, stop, save, manual, cancel]) update(control, 'disabled', true);
            update(cancel, 'hidden', true);
            update(error, 'textContent', e.message);
            renderFavorites(null, true);
        }
    }
    async function request(path, options) {
        const response = await window.fetch(path, {...options, credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}});
        if (!response.ok) {
            const text = await response.text();
            let details = text.slice(0, 500);
            if (response.headers.get('content-type')?.includes('application/json')) {
                const body = JSON.parse(text);
                details = [...(body.errorMessages || []), ...Object.values(body.errors || {})].join(' ') || details;
            }
            throw new Error(`Jira HTTP ${response.status}: ${details}`);
        }
        return response.json();
    }
    async function findSaved(value) {
        const marker = `[jira-direct-timer:${value.id}]`;
        let user = null;
        let offset = 0;
        while (true) {
            const body = await request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}/worklog?startAt=${offset}&maxResults=100`);
            if (!Array.isArray(body.worklogs) || !Number.isFinite(body.total)) throw new Error('Unexpected Jira work log response.');
            for (const worklog of body.worklogs) {
                if (typeof worklog.comment !== 'string' || !worklog.comment.includes(marker)) continue;
                // Another user's worklog carrying our marker must not count as our saved entry.
                if (!user) user = await currentUser(' The entry was not sent.');
                if (isOwnWorklog(worklog, user)) return worklog;
            }
            offset += body.worklogs.length;
            if (offset >= body.total) return null;
            if (!body.worklogs.length) throw new Error('Jira did not return all entries. The entry was not retried.');
        }
    }
    async function act(action) {
        if (busy) return false;
        busy = true;
        notice = '';
        let completed = false;
        try {
            actionDisplay = read();
            render();
            if (!navigator.locks) throw new Error('This browser does not support locking across tabs. Use Jira Log work instead.');
            await navigator.locks.request(KEY, {ifAvailable: true}, async lock => {
                if (!lock) throw new Error('Another tab is changing the timer. Try again later.');
                await action();
            });
            completed = true;
        } catch (e) {
            notice = e instanceof InputError ? e.message : `${e.message}\nTime remains saved in this browser. Check for duplicates before logging it another way.`;
        } finally {
            busy = false;
            actionDisplay = null;
            render();
        }
        return completed;
    }
    async function startTimer(key) {
        const old = read();
        if (!key) throw new Error('Open a Jira issue.');
        if (old && old.manualEntry) throw new Error(MANUAL_PENDING);
        if (old && old.manualNext) throw new Error('First complete the pending manual entry using Save.');
        if (old && old.phase !== 'saved') {
            if (old.issue === key) throw new Error('This issue already has an active timer.');
            if (old.phase === 'running') {
                old.ended = Date.now();
                old.phase = 'stopped';
            }
            old.nextIssue = key;
            write(old);
            await saveEntry(old);
            write(newTimer(key, old.ended));
            return;
        }
        write(newTimer(key, Date.now()));
    }
    start.onclick = () => act(() => startTimer(issue()));
    function readRunning() {
        const value = read();
        if (!value || value.phase !== 'running') throw new Error('The timer is no longer running.');
        if (value.manualEntry) throw new Error(MANUAL_PENDING);
        return value;
    }
    stop.onclick = () => act(async () => {
        const value = readRunning();
        value.ended = Date.now();
        value.phase = 'stopped';
        write(value);
        await saveEntry(value);
    });
    cancel.onclick = () => act(async () => {
        const value = readRunning();
        localStorage.removeItem(KEY);
        showToast(value, true);
    });
    async function finishManual(value) {
        if (value.phase !== 'saved' || !value.manualNext) return;
        const entry = value.manualNext;
        write(entry);
        await saveEntry(entry);
    }
    async function finishIndependentManual(value) {
        const entry = value.manualEntry;
        if (entry.phase !== 'saved') await saveEntry(entry, () => write(value));
        delete value.manualEntry;
        write(value);
        minutes.value = '';
    }
    class InputError extends Error {}
    // A number input reports typed text as '' with validity.badInput, so only a truly blank or zero value means "write nothing".
    function emptyMinutes(raw, badInput) {
        return !badInput && /^0*$/.test(String(raw).trim());
    }
    function showEmptyToast() {
        const node = addToast('empty', 'Added 0 minutes', favoriteNode('span', '', 'Nothing was logged.'));
        notifications.push({node, expiresAt: Date.now() + 5000});
    }
    function skipEmptyMinutes(raw, badInput) {
        if (busy || !emptyMinutes(raw, badInput)) return false;
        notice = '';
        showEmptyToast();
        return true;
    }
    async function addMinutes(key, raw) {
        if (!key) throw new Error('Open a Jira issue.');
        const count = parseMinutes(raw);
        if (count === null) throw new InputError('Enter a positive whole number of minutes.');
        const old = read();
        if (old && (old.phase === 'pending' || old.manualNext || old.manualEntry)) throw new Error('First verify the previous entry.');
        const end = Date.now();
        const entry = {...newTimer(key, end - count * 60000), ended: end, phase: 'stopped', manual: true};
        if (old && old.phase === 'running') {
            old.manualEntry = entry;
            write(old);
            await finishIndependentManual(old);
        } else if (old && old.phase !== 'saved') {
            delete old.nextIssue;
            old.manualNext = entry;
            write(old);
            await saveEntry(old);
            await finishManual(old);
        } else {
            write(entry);
            await saveEntry(entry);
        }
    }
    manual.onclick = () => {
        if (skipEmptyMinutes(minutes.value, minutes.validity && minutes.validity.badInput)) {
            minutes.value = '';
            render();
            return;
        }
        return act(async () => {
            await addMinutes(issue(), minutes.value);
            minutes.value = '';
        });
    };
    minutes.onkeydown = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!manual.disabled) return manual.onclick();
        }
    };

    function readFavorites() {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return [];
        let list;
        try {
            list = JSON.parse(raw);
        } catch (e) {
            list = null;
        }
        if (!Array.isArray(list) || list.length > FAVORITES_LIMIT || list.some((value, index) =>
            !value || !ISSUE_PATTERN.test(value.issue) || typeof value.title !== 'string' || value.title.length > 500 ||
            (value.customTitle !== undefined && (typeof value.customTitle !== 'string' || !value.customTitle.trim() || value.customTitle.length > 500)) ||
            list.findIndex(other => other && other.issue === value.issue) !== index)) {
            throw new Error('The favorites list is corrupted. Do not delete the data; it needs inspection.');
        }
        return list;
    }
    function changeFavorites(change) {
        try {
            const list = readFavorites();
            const next = change(list);
            if (next) localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
            favMessage = '';
        } catch (e) {
            favMessage = e.message;
        }
        render();
    }
    function addFavorite(item) {
        changeFavorites(list => {
            if (list.some(value => value.issue === item.issue)) return null;
            if (list.length >= FAVORITES_LIMIT) {
                throw new Error(`You can have at most ${FAVORITES_LIMIT} favorites. Remove one first.`);
            }
            return [...list, {issue: item.issue, title: item.title}];
        });
        if (favMessage) return;
        favHighlight = {issue: item.issue, until: Date.now() + 1500};
        closeFavoriteSearch();
        render();
        favAdd.focus();
    }
    function removeFavorite(key) {
        if (favEditKey === key) favEditKey = null;
        if (favNameKey === key) favNameKey = null;
        favMenuKey = null;
        changeFavorites(list => list.filter(value => value.issue !== key));
    }
    function loadFavoriteProject(key) {
        if (favoriteProjects.has(key)) return;
        favoriteProjects.set(key, {state: 'loading'});
        request(`/rest/api/2/issue/${encodeURIComponent(key)}?fields=project`)
            .then(body => {
                const name = body.fields?.project?.name;
                if (typeof name !== 'string' || !name.trim()) throw new Error('Jira did not return the project name.');
                favoriteProjects.set(key, {state: 'ready', name: name.trim()});
                render();
            })
            .catch(e => {
                favoriteProjects.set(key, {state: 'error', error: e.message});
                render();
            });
    }
    function closeFavoriteSearch() {
        favSearchOpen = false;
        favSearch.value = '';
        favSearchItems = [];
        favSearchState = 'idle';
        favSearchSeq++;
        clearTimeout(favSearchTimer);
    }
    function openFavorites() {
        favoritesOpen = true;
        favMessage = '';
        render();
        favClose.focus();
    }
    function closeFavorites(animate) {
        closeFavoriteSearch();
        favEditKey = null;
        favEditValue = '';
        favMenuKey = null;
        favNameKey = null;
        favMessage = '';
        const finish = () => {
            favoritesOpen = false;
            favoritesClosing = false;
            delete favoritesSection.dataset.closing;
            render();
        };
        const reducedMotion = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!animate || reducedMotion) {
            finish();
            return;
        }
        favoritesClosing = true;
        favoritesSection.dataset.closing = '';
        setTimeout(finish, 450);
    }
    function pickerIssues(body) {
        if (!body || !Array.isArray(body.sections)) throw new Error('Jira returned an unexpected search response.');
        const found = new Map();
        for (const section of body.sections) {
            for (const item of Array.isArray(section?.issues) ? section.issues : []) {
                if (!ISSUE_PATTERN.test(item?.key) || found.has(item.key)) continue;
                const title = typeof item.summaryText === 'string' ? item.summaryText :
                    typeof item.summary === 'string' ? item.summary.replace(/<[^>]*>/g, '') : '';
                found.set(item.key, {issue: item.key, title: title.trim().slice(0, 500)});
            }
        }
        return [...found.values()].slice(0, 8);
    }
    async function searchFavoriteIssues(query, sequence) {
        try {
            const body = await request(`/rest/api/2/issue/picker?query=${encodeURIComponent(query)}&showSubTasks=true&showSubTaskParent=true`);
            if (sequence !== favSearchSeq) return;
            favSearchItems = pickerIssues(body);
            favSearchState = 'done';
            favMessage = '';
        } catch (e) {
            if (sequence !== favSearchSeq) return;
            favSearchItems = [];
            favSearchState = 'error';
            favMessage = `Search failed: ${e.message}`;
        }
        render();
    }
    async function startFavorite(key) {
        if (favoritesClosing) return;
        if (await act(() => startTimer(key))) closeFavorites(true);
    }
    async function saveFavoriteMinutes(key) {
        if (skipEmptyMinutes(favEditValue, favEditInvalid) || await act(() => addMinutes(key, favEditValue))) {
            favEditKey = null;
            favEditValue = '';
            favEditInvalid = false;
            render();
        }
    }
    function favoriteNode(tag, name, text) {
        const node = document.createElement(tag);
        if (name) node.dataset[name] = '';
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function issueAnchor(node, key) {
        node.href = browseUrl(key);
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
        return node;
    }
    function favoriteEditor(key) {
        const editor = favoriteNode('div', 'favEditor');
        const quick = favoriteNode('div', 'favEditorRow');
        const input = favoriteNode('input', 'favMinutesInput');
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.value = favEditValue;
        input.placeholder = 'minutes';
        input.setAttribute('aria-label', `Minutes for ${key}`);
        input.oninput = () => {
            favEditValue = input.value;
            favEditInvalid = !!(input.validity && input.validity.badInput);
        };
        for (const count of ['15', '30', '60']) {
            const button = favoriteNode('button', 'favQuick', count);
            button.setAttribute('aria-label', `Fill in ${count} minutes`);
            button.onclick = () => {
                favEditValue = count;
                favEditInvalid = false;
                input.value = count;
                input.focus();
            };
            quick.appendChild(button);
        }
        const row = favoriteNode('div', 'favEditorRow');
        const submit = favoriteNode('button', 'favMinutesSave', 'SAVE');
        submit.setAttribute('aria-label', `Save minutes to ${key}`);
        submit.disabled = busy;
        submit.onclick = () => saveFavoriteMinutes(key);
        input.onkeydown = event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (!submit.disabled) saveFavoriteMinutes(key);
            } else if (event.key === 'Escape') {
                favEditKey = null;
                render();
            }
        };
        row.appendChild(input);
        row.appendChild(submit);
        editor.appendChild(quick);
        editor.appendChild(row);
        return {editor, input};
    }
    function favoriteNameEditor(item) {
        const editor = favoriteNode('div', 'favNameEditor');
        const input = favoriteNode('input', 'favNameInput');
        input.type = 'text';
        input.maxLength = 500;
        input.value = favNameValue;
        input.setAttribute('aria-label', `Custom name and emoji for ${item.issue}`);
        input.oninput = () => { favNameValue = input.value; };
        const hint = favoriteNode('div', 'favNameHint', `Original name: ${item.originalTitle || item.issue}`);
        const actions = favoriteNode('div', 'favNameActions');
        const saveName = value => {
            changeFavorites(list => list.map(favorite => {
                if (favorite.issue !== item.issue) return favorite;
                const next = {...favorite};
                if (value) next.customTitle = value;
                else delete next.customTitle;
                return next;
            }));
            if (!favMessage) {
                favNameKey = null;
                favFocusToggle = item.issue;
                render();
            }
        };
        const saveNameButton = favoriteNode('button', 'favNameSave', 'Save');
        saveNameButton.onclick = () => saveName(favNameValue.trim());
        const cancel = favoriteNode('button', 'favNameCancel', 'Cancel');
        cancel.onclick = () => { favNameKey = null; favFocusToggle = item.issue; render(); };
        const reset = favoriteNode('button', 'favNameReset', 'Restore original name');
        reset.onclick = () => saveName('');
        input.onkeydown = event => {
            if (event.key === 'Enter') { event.preventDefault(); saveNameButton.onclick(); }
            else if (event.key === 'Escape') { event.preventDefault(); cancel.onclick(); }
        };
        actions.appendChild(saveNameButton);
        actions.appendChild(cancel);
        actions.appendChild(reset);
        editor.appendChild(input);
        editor.appendChild(hint);
        editor.appendChild(actions);
        return {editor, input};
    }
    function favoriteRow(item) {
        const row = favoriteNode('div', 'favRow');
        row.dataset.favIssue = item.issue;
        if (item.fresh) row.dataset.fresh = '';
        const info = issueAnchor(favoriteNode('a', 'favInfo'), item.issue);
        info.setAttribute('title', `Open ${item.issue} in a new tab`);
        const summary = favoriteNode('span', 'favSummary');
        if (item.running) summary.appendChild(favoriteNode('span', 'favDot', '\u25cf'));
        summary.appendChild(favoriteNode('span', 'favSummaryText', item.title || item.issue));
        info.appendChild(summary);
        const key = favoriteNode('span', 'favKey', `${item.project} \u00b7 ${item.issue}${item.projectError ? ' \u00b7 project not loaded' : ''}`);
        if (item.projectError) key.setAttribute('title', `Could not load project name: ${item.projectError}`);
        info.appendChild(key);
        const add = favoriteNode('button', 'favMinutes', '+min');
        add.setAttribute('aria-label', `Add minutes to ${item.issue}`);
        add.setAttribute('aria-expanded', String(item.editing));
        add.disabled = item.minutesDisabled;
        add.onclick = () => {
            favMenuKey = null;
            favNameKey = null;
            favEditKey = favEditKey === item.issue ? null : item.issue;
            favEditValue = '';
            favEditInvalid = false;
            favFocusEditor = !!favEditKey;
            render();
        };
        const play = favoriteNode('button', item.running ? 'favStop' : 'favStart', item.running ? '\u25a0' : '\u25b6');
        play.setAttribute('aria-label', `${item.running ? 'Stop' : 'Start'} timer for ${item.issue}`);
        play.setAttribute('title', `${item.running ? 'Stop' : 'Start'} timer for ${item.issue}`);
        play.disabled = item.running ? item.stopDisabled : item.startDisabled;
        play.onclick = () => item.running ? stop.onclick() : startFavorite(item.issue);
        const menuToggle = favoriteNode('button', 'favMenuToggle', '\u22ef');
        menuToggle.setAttribute('aria-label', `More actions for ${item.issue}`);
        menuToggle.setAttribute('aria-expanded', String(item.menuOpen));
        menuToggle.onclick = () => {
            favMenuKey = favMenuKey === item.issue ? null : item.issue;
            favFocusMenu = !!favMenuKey;
            favFocusToggle = favMenuKey ? null : item.issue;
            favEditKey = null;
            favNameKey = null;
            render();
        };
        row.appendChild(info);
        row.appendChild(add);
        row.appendChild(play);
        row.appendChild(menuToggle);
        if (item.menuOpen) {
            const menu = favoriteNode('div', 'favMenu');
            const rename = favoriteNode('button', 'favRename', '\u270e  Edit name and emoji');
            rename.onclick = () => {
                favMenuKey = null;
                favNameKey = item.issue;
                favNameValue = item.customTitle || item.originalTitle;
                favFocusName = true;
                render();
            };
            const remove = favoriteNode('button', 'favRemove', '\u00d7  Remove from favorites');
            remove.onclick = () => removeFavorite(item.issue);
            menu.appendChild(rename);
            if (item.projectError) {
                const retry = favoriteNode('button', 'favProjectRetry', 'Retry loading project');
                retry.onclick = () => { favoriteProjects.delete(item.issue); loadFavoriteProject(item.issue); render(); };
                menu.appendChild(retry);
            }
            menu.appendChild(remove);
            menu.onkeydown = event => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                favMenuKey = null;
                favFocusToggle = item.issue;
                render();
            };
            row.appendChild(menu);
        }
        return row;
    }
    function favoriteResult(item, saved, full) {
        const row = favoriteNode('div', 'favResult');
        row.dataset.favIssue = item.issue;
        const link = issueAnchor(favoriteNode('a', 'favResultLink'), item.issue);
        link.setAttribute('title', `Open ${item.issue} in a new tab`);
        link.appendChild(favoriteNode('b', '', item.issue));
        link.appendChild(favoriteNode('span', '', item.title));
        link.appendChild(favoriteNode('i', '', '\u2197'));
        row.appendChild(link);
        if (saved) {
            row.appendChild(favoriteNode('em', 'favSaved', 'saved'));
        } else {
            const pin = favoriteNode('button', 'favPin', '+');
            pin.setAttribute('aria-label', `Add ${item.issue} to favorites`);
            pin.setAttribute('title', 'Add to favorites');
            pin.disabled = full;
            pin.onclick = () => addFavorite(item);
            row.appendChild(pin);
        }
        return row;
    }
    function renderFavorites(value, timerBroken) {
        let list = [];
        let storageError = '';
        try {
            list = readFavorites();
        } catch (e) {
            storageError = e.message;
        }
        update(favOpen, 'hidden', favoritesOpen);
        update(favOpen.dataset, 'state', storageError ? 'error' : 'ok');
        update(favCount, 'textContent', storageError ? '!' : String(list.length));
        updateAttr(favOpen, 'aria-label', storageError ? 'Favorites: list is corrupted. Open' :
            `Favorites (${list.length}). Open`);
        updateAttr(favOpen, 'title', storageError ? 'Favorites list is corrupted' : 'Favorite issues');
        updateAttr(favOpen, 'aria-expanded', String(favoritesOpen));
        update(favoritesSection, 'hidden', !favoritesOpen);
        update(favAdd, 'hidden', favSearchOpen);
        update(favAdd, 'disabled', !!storageError || favoritesClosing);
        const full = !storageError && list.length >= FAVORITES_LIMIT;
        const limitText = `You have ${FAVORITES_LIMIT} favorites. Remove one before adding another (\u22ef menu).`;
        update(favSearchWrap, 'hidden', !favSearchOpen);
        update(favSearch, 'disabled', full);
        updateAttr(favSearch, 'placeholder', full ? `Favorites limit (${FAVORITES_LIMIT}) reached` : 'Search: key or title');
        updateAttr(favAdd, 'title', full ? limitText : 'Add issue to favorites');
        update(favLimit, 'hidden', !(full && favSearchOpen));
        update(favLimit, 'textContent', full ? limitText : '');
        update(favError, 'textContent', [storageError, favSearchState === 'error' ? '' : favMessage].filter(Boolean).join('\n'));
        if (!favoritesOpen) {
            favoritesSignature = '';
            return;
        }
        const runningIssue = value && value.phase === 'running' ? value.issue : null;
        const waiting = !!(value && (value.manualNext || value.manualEntry));
        const active = !!(value && (value.phase !== 'saved' || value.manualNext));
        const blocked = timerBroken || busy || waiting || favoritesClosing;
        const fresh = favHighlight && Date.now() < favHighlight.until ? favHighlight.issue : '';
        for (const favorite of list) {
            if (favorite.title && !titles.has(favorite.issue)) titles.set(favorite.issue, favorite.title);
            loadFavoriteProject(favorite.issue);
        }
        const items = list.map(favorite => ({
            issue: favorite.issue,
            originalTitle: favorite.title || titleFor({issue: favorite.issue}),
            customTitle: favorite.customTitle || '',
            title: favorite.customTitle || favorite.title || titleFor({issue: favorite.issue}),
            project: favoriteProjects.get(favorite.issue)?.name || favorite.issue.split('-')[0],
            projectError: favoriteProjects.get(favorite.issue)?.error || '',
            running: favorite.issue === runningIssue,
            fresh: favorite.issue === fresh,
            editing: favorite.issue === favEditKey,
            nameEditing: favorite.issue === favNameKey,
            menuOpen: favorite.issue === favMenuKey,
            startDisabled: blocked || (active && value.issue === favorite.issue),
            stopDisabled: timerBroken || busy || !!(value && value.manualEntry) || favoritesClosing,
            minutesDisabled: blocked || !!(value && value.phase === 'pending')
        }));
        const saved = new Set(list.map(favorite => favorite.issue));
        const signature = JSON.stringify([items, storageError, favSearchOpen, favSearchState, favSearchItems, favMessage, favEditKey, busy, full]);
        if (signature === favoritesSignature) return;
        favoritesSignature = signature;
        const focusedName = document.activeElement && document.activeElement.dataset && 'favNameInput' in document.activeElement.dataset;
        const focusedMinutes = document.activeElement && document.activeElement.dataset && 'favMinutesInput' in document.activeElement.dataset;
        const activeRow = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-fav-row]');
        const activeAction = activeRow && ['favMenuToggle', 'favRename', 'favRemove', 'favProjectRetry', 'favMinutes', 'favStart', 'favStop']
            .find(name => name in document.activeElement.dataset);
        const activeIssue = activeRow && activeRow.dataset.favIssue;
        const selectionStart = focusedName ? document.activeElement.selectionStart : null;
        const selectionEnd = focusedName ? document.activeElement.selectionEnd : null;
        const rows = [];
        let editorInput = null;
        let menuFocus = null;
        let toggleFocus = null;
        for (const item of items) {
            const row = favoriteRow(item);
            rows.push(row);
            if (item.menuOpen && favFocusMenu) menuFocus = row.children[4].children[0];
            if (favFocusToggle === item.issue) toggleFocus = row.children[3];
            if (item.editing) {
                const {editor, input} = favoriteEditor(item.issue);
                rows.push(editor);
                if (favFocusEditor || focusedMinutes) editorInput = input;
            }
            if (item.nameEditing) {
                const {editor, input} = favoriteNameEditor(item);
                rows.push(editor);
                if (favFocusName || focusedName) editorInput = input;
            }
        }
        if (!items.length && !storageError) {
            rows.push(favoriteNode('div', 'favEmpty', 'No favorites yet. Add an issue using +.'));
        }
        favList.replaceChildren(...rows);
        if (editorInput && (favFocusEditor || favFocusName || focusedName || focusedMinutes)) {
            editorInput.focus();
            if (focusedName && selectionStart !== null && selectionEnd !== null) editorInput.setSelectionRange(selectionStart, selectionEnd);
        } else if (menuFocus) menuFocus.focus();
        else if (toggleFocus) toggleFocus.focus();
        else if (activeIssue && activeAction) {
            const row = favList.querySelector(`[data-fav-issue="${activeIssue}"]`);
            const attribute = activeAction.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
            const action = row && row.querySelector(`[data-${attribute}]`);
            if (action) action.focus();
        }
        favFocusEditor = false;
        favFocusName = false;
        favFocusMenu = false;
        favFocusToggle = null;
        const searchError = favoriteNode('div', 'favMessage', favMessage);
        searchError.dataset.state = 'error';
        const results = favSearchState === 'error' ? [searchError] : favSearchState === 'loading' ? [favoriteNode('div', 'favMessage', 'Searching...')] :
            favSearchState === 'done' && !favSearchItems.length ? [favoriteNode('div', 'favMessage', 'No results found.')] :
                favSearchItems.map(item => favoriteResult(item, saved.has(item.issue), full));
        favResults.replaceChildren(...results);
        favResults.hidden = !favSearchOpen || favSearchState === 'idle';
    }
    favOpen.onclick = openFavorites;
    favClose.onclick = () => {
        if (favoritesClosing) return;
        closeFavorites(false);
        favOpen.focus();
    };
    favAdd.onclick = () => {
        favSearchOpen = true;
        favEditKey = null;
        favMenuKey = null;
        favNameKey = null;
        favMessage = '';
        render();
        favSearch.focus();
    };
    favSearch.oninput = () => {
        const query = favSearch.value.trim();
        const sequence = ++favSearchSeq;
        clearTimeout(favSearchTimer);
        favSearchItems = [];
        favMessage = '';
        favSearchState = query.length < 2 ? 'idle' : 'loading';
        if (query.length >= 2) favSearchTimer = setTimeout(() => searchFavoriteIssues(query, sequence), 250);
        render();
    };
    function dismissFavoriteSearch() {
        closeFavoriteSearch();
        favMessage = '';
        render();
        favAdd.focus();
    }
    favSearchClose.onclick = dismissFavoriteSearch;
    favSearch.onkeydown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        dismissFavoriteSearch();
    };

    function openAutoSettings() {
        try {
            autoSettingsValue = readAutoSettings();
            autoEnabled.checked = autoSettingsValue.enabled;
            autoMinutes.value = String(autoSettingsValue.minutes);
            autoMinutes.disabled = !autoSettingsValue.enabled;
            autoError.textContent = '';
            autoRetry.hidden = readAutoQueue().length === 0;
        } catch (e) {
            autoError.textContent = e.message;
            autoRetry.hidden = true;
        }
        autoSettingsDialog.hidden = false;
        autoEnabled.focus();
    }

    autoOpen.onclick = openAutoSettings;
    autoClose.onclick = () => { autoSettingsDialog.hidden = true; };
    autoEnabled.onchange = () => { autoMinutes.disabled = !autoEnabled.checked; };
    autoSave.onclick = () => {
        const minutesValue = parseMinutes(autoMinutes.value);
        if (autoEnabled.checked && minutesValue === null) {
            autoError.textContent = 'Enter a positive whole number of minutes.';
            return;
        }
        const value = {
            enabled: autoEnabled.checked,
            minutes: autoEnabled.checked ? minutesValue : autoSettingsValue.minutes
        };
        try {
            localStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(value));
            autoSettingsValue = value;
            autoSettingsBroken = false;
            notice = '';
            autoSettingsDialog.hidden = true;
            render();
        } catch (e) {
            autoError.textContent = e.message;
        }
    };
    autoRetry.onclick = async () => { await processAutomaticEntries(); };

    function reportAutomaticError(errorValue) {
        notice = `Automatic work logging: ${errorValue.message}`;
        autoError.textContent = errorValue.message;
        render();
    }

    async function saveEntry(value, persist = write, notify = true) {
        if (!value || !['stopped', 'pending'].includes(value.phase)) throw new Error('There is nothing to save.');
        let worklog = await findSaved(value);
        if (!worklog) {
            if (value.phase === 'pending') throw new Error('Entry not found yet. It will not be retried automatically; check the Jira Work log.');
            const measuredSeconds = Math.max(1, duration(value));
            const seconds = Math.max(60, Math.floor(measuredSeconds / 60) * 60);
            value.phase = 'pending';
            persist(value);
            worklog = await request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}/worklog?adjustEstimate=leave`, {
                method: 'POST',
                body: JSON.stringify({started: stamp(value.started), timeSpentSeconds: seconds, comment: `${value.automatic ? 'Automatic work log (Jira timer)' : value.manual ? 'Manual work log (Jira timer)' : 'Work on issue (Jira timer)'}${measuredSeconds < 60 ? `\nTracked ${measuredSeconds} s; saved minimum 1 minute.` : ''}\n[jira-direct-timer:${value.id}]`})
            });
            if (!worklog.id) throw new Error('Jira did not return the new work log ID. Verify the previous entry.');
        }
        value.phase = 'saved';
        value.worklogId = worklog.id;
        value.recordedSeconds = worklog.timeSpentSeconds;
        value.completedAt = Date.now();
        worklogTotals.delete(value.issue);
        persist(value);
        if (notify) showToast(value);
    }

    async function processAutomaticEntries() {
        if (autoBusy) return;
        autoBusy = true;
        const failures = [];
        try {
            if (!navigator.locks) throw new Error('This browser does not support locking across tabs. The automatic entry was not sent.');
            await navigator.locks.request(KEY, {ifAvailable: true}, async lock => {
                if (!lock) throw new Error('Another tab is changing the timer. Process the pending automatic entry in AUTO settings.');
                for (const entry of readAutoQueue()) {
                    if (entry.phase === 'saved') {
                        removeAutoEntry(entry.id);
                        continue;
                    }
                    try {
                        await saveEntry(entry, persistAutoEntry, entry.phase !== 'pending');
                        removeAutoEntry(entry.id);
                        autoRetry.hidden = readAutoQueue().length === 0;
                    } catch (e) {
                        failures.push(`${entry.issue}: ${e.message}`);
                    }
                }
                if (failures.length) throw new Error(failures.join('\n'));
            });
        } catch (e) {
            reportAutomaticError(e);
        } finally {
            autoBusy = false;
            render();
        }
    }

    function automaticIssueCreated(key) {
        if (!autoSettingsValue.enabled) return;
        const ended = Date.now();
        const entry = {
            id: `auto-${key}`, issue: key, started: ended - autoSettingsValue.minutes * 60000,
            ended, phase: 'stopped', automatic: true
        };
        const entries = readAutoQueue();
        if (!entries.some(value => value.id === entry.id)) {
            entries.push(entry);
            writeAutoQueue(entries);
            autoRetry.hidden = false;
        }
        void processAutomaticEntries();
    }

    function issueCreationRequest(input, options) {
        const raw = input && typeof input === 'object' && typeof input.url === 'string' ? input.url : input;
        const method = String(options && options.method || input && input.method || 'GET').toUpperCase();
        if (method !== 'POST' || raw === undefined || raw === null) return false;
        let url;
        try {
            url = new URL(String(raw), location.href);
        } catch (e) {
            return false;
        }
        return url.origin === location.origin && (
            /\/rest\/api\/(?:2|latest)\/issue\/?$/.test(url.pathname) ||
            /\/secure\/(?:QuickCreateIssue|Create(?:SubTask)?IssueDetails)\.jspa$/.test(url.pathname)
        );
    }

    function captureCreatedIssue(body) {
        const key = body && (body.key || body.issueKey || body.issue && body.issue.key);
        if (typeof key !== 'string' || !ISSUE_PATTERN.test(key)) {
            throw new Error('The issue creation response did not return its key. The work log was not sent; check the result in Jira.');
        }
        return automaticIssueCreated(key);
    }

    function installIssueCreationObserver() {
        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function') {
            window.fetch = function (...args) {
                const result = originalFetch.apply(this, args);
                if (!issueCreationRequest(args[0], args[1])) return result;
                return Promise.resolve(result).then(async response => {
                    if (autoSettingsValue.enabled && response.ok) {
                        try {
                            captureCreatedIssue(await response.clone().json());
                        } catch (e) {
                            reportAutomaticError(e);
                        }
                    }
                    return response;
                });
            };
        }
        const prototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
        if (!prototype) return;
        const requests = new WeakMap();
        const originalOpen = prototype.open;
        const originalSend = prototype.send;
        prototype.open = function (method, url, ...args) {
            requests.set(this, {method, url});
            return originalOpen.call(this, method, url, ...args);
        };
        prototype.send = function (...args) {
            const requestValue = requests.get(this);
            if (requestValue && issueCreationRequest(requestValue.url, {method: requestValue.method})) {
                this.addEventListener('load', () => {
                    if (!autoSettingsValue.enabled || this.status < 200 || this.status >= 300) return;
                    try {
                        const body = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                        Promise.resolve(captureCreatedIssue(body)).catch(reportAutomaticError);
                    } catch (e) {
                        reportAutomaticError(e);
                    }
                }, {once: true});
            }
            return originalSend.apply(this, args);
        };
    }

    save.onclick = () => act(async () => {
        const value = read();
        if (value && value.manualEntry) {
            await finishIndependentManual(value);
            return;
        }
        if (!(value && value.phase === 'saved' && value.manualNext)) await saveEntry(value);
        await finishManual(value);
        if (value.phase === 'saved' && value.nextIssue) {
            write(newTimer(value.nextIssue, value.ended));
        }
    });
    autoSettingsValue = {enabled: false, minutes: 10};
    try {
        autoSettingsValue = readAutoSettings();
    } catch (e) {
        notice = e.message;
    }
    installIssueCreationObserver();
    window.addEventListener('storage', event => {
        if (event.key === KEY || event.key === FAVORITES_KEY) render();
        if (event.key !== AUTO_SETTINGS_KEY) return;
        try {
            autoSettingsValue = readAutoSettings();
            render();
        } catch (e) {
            reportAutomaticError(e);
        }
    });
    setInterval(render, 100);
    render();
    try {
        if (readAutoQueue().length) void processAutomaticEntries();
    } catch (e) {
        reportAutomaticError(e);
    }
})();
