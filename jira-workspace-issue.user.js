// ==UserScript==
// @name         Jira Local Workspace - Modern issue view
// @namespace    alza.jira-local-workspace
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-issue.user.js
// @downloadURL  https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-issue.user.js
// @description  A compact dark Jira workspace with native editing, workflow and a reversible theme.
// @match        https://jira.alza.cz/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.top !== window || document.getElementById('jira-local-workspace-style')) return;

    const KEY = 'jira-local-workspace-ui-v1';
    const defaults = () => ({enabled: true, compact: true});
    const sections = [
        ['details-module', 'Detaily'], ['descriptionmodule', 'Popis'],
        ['attachmentmodule', 'Prilohy'], ['linkingmodule', 'Odkazy'],
        ['activitymodule', 'Aktivita'], ['peoplemodule', 'Lide'],
        ['datesmodule', 'Datumy'], ['timetrackingmodule', 'Cas']
    ];
    let storageError = '';
    let persistenceBlocked = false;
    let preferences = loadPreferences();
    let currentRoot = null;
    let currentSections = [];
    let scheduled = false;

    function reportStorageError(error) {
        storageError = `Nastaveni vzhledu nelze ulozit nebo nacist: ${error.message}. Volby plati jen docasne. Data stopek nebyla zmenena.`;
        console.error('[Jira Local Workspace]', error);
    }
    function loadPreferences() {
        storageError = '';
        persistenceBlocked = false;
        try {
            const raw = localStorage.getItem(KEY);
            if (raw === null) return defaults();
            const value = JSON.parse(raw);
            if (!value || typeof value.enabled !== 'boolean' || typeof value.compact !== 'boolean') {
                throw new Error('Neplatny format nastaveni vzhledu');
            }
            return {enabled: value.enabled, compact: value.compact};
        } catch (error) {
            persistenceBlocked = true;
            reportStorageError(error);
            return defaults();
        }
    }
    function savePreferences() {
        if (!persistenceBlocked) {
            try {
                localStorage.setItem(KEY, JSON.stringify(preferences));
                storageError = '';
            } catch (error) {
                reportStorageError(error);
            }
        }
        sync();
    }

    const style = document.createElement('style');
    style.id = 'jira-local-workspace-style';
    style.textContent = `
        #jira-local-workspace-toolbar {
            --jlw-ink:#e4e5e7;--jlw-muted:#a2a4ab;--jlw-line:#38393e;--jlw-accent:#b9adff;
            box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;
            max-width:1280px;margin:0 auto;padding:8px 22px;border:0;border-bottom:1px solid var(--jlw-line);
            border-radius:0;background:#1e1f21;color:var(--jlw-ink);
            box-shadow:none;font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        #jira-local-workspace-toolbar * {box-sizing:border-box}
        #jira-local-workspace-toolbar [data-brand] {display:flex;align-items:center;gap:7px;flex-shrink:0}
        #jira-local-workspace-toolbar [data-brand]::before {
            content:'';width:7px;height:7px;border-radius:50%;background:#b9adff;
        }
        #jira-local-workspace-toolbar strong {display:block;font-size:12px;font-weight:600}
        #jira-local-workspace-toolbar nav {display:flex;flex:1;flex-wrap:wrap;gap:2px}
        #jira-local-workspace-toolbar a {padding:4px 7px;border-radius:4px;color:var(--jlw-muted);text-decoration:none;font-weight:400}
        #jira-local-workspace-toolbar a:hover {background:#2d2e33;color:var(--jlw-ink)}
        #jira-local-workspace-toolbar [data-controls] {display:flex;flex-wrap:wrap;gap:5px;margin-left:auto}
        #jira-local-workspace-toolbar button {
            appearance:none;padding:4px 8px;border:1px solid var(--jlw-line);border-radius:5px;background:transparent;
            color:var(--jlw-ink);font:400 11px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;
        }
        #jira-local-workspace-toolbar button:hover {background:#2d2e33}
        #jira-local-workspace-toolbar button[aria-pressed="true"] {border-color:#555064;background:#302c3d;color:#d1c8ff}
        #jira-local-workspace-toolbar :is(a,button):focus-visible {outline:2px solid #b9adff;outline-offset:2px}
        #jira-local-workspace-toolbar [data-error] {flex-basis:100%;margin:0;color:#ffadaf;font-size:12px}
        #jira-local-workspace-toolbar [hidden] {display:none!important}

        html[data-jlw="on"] {
            color-scheme:dark;--jlw-bg:#1e1f21;--jlw-surface:#252628;--jlw-ink:#e4e5e7;--jlw-muted:#a2a4ab;
            --jlw-line:#38393e;--jlw-accent:#b9adff;--jlw-space:20px;--jlw-card-space:14px;
        }
        html[data-jlw="on"][data-jlw-density="compact"] {--jlw-space:8px;--jlw-card-space:6px}
        html[data-jlw="on"] body {background:var(--jlw-bg);color:var(--jlw-ink)}
        html[data-jlw="on"] #content {background:var(--jlw-bg)}
        html[data-jlw="on"] #content > .aui-page-panel {border:0;background:transparent}
        html[data-jlw="on"] :is(#main,#main-content,.aui-page-panel-content) {background:transparent}
        html[data-jlw="on"] #header > .aui-header {
            background:#252628;border-bottom:1px solid var(--jlw-line);box-shadow:none;
        }
        html[data-jlw="on"] #header > .aui-header .aui-nav > li > a {color:#d0d1d5}
        html[data-jlw="on"] #header > .aui-header .aui-nav > li > a:hover {background:#333438}
        html[data-jlw="on"] .aui-sidebar {background:#252628;border-right:1px solid var(--jlw-line)}
        html[data-jlw="on"] .aui-sidebar .aui-nav > li > a {border-radius:4px;margin:1px 6px;color:#c3c5cb}
        html[data-jlw="on"] .aui-sidebar .aui-nav > li.aui-nav-selected > a {background:#35313f;color:#d1c8ff}

        html[data-jlw="on"] :is(#issue-content,#issue-view) {
            box-sizing:border-box;max-width:1280px;margin:0 auto;padding:16px 22px 24px;
            color:var(--jlw-ink);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .issue-header {
            margin:0 0 var(--jlw-space);padding:0 0 16px;border:0;border-bottom:1px solid var(--jlw-line);
            border-radius:0;background:transparent;box-shadow:none;
        }
        html[data-jlw="on"] #summary-val {
            margin:8px 0 10px;color:var(--jlw-ink);font-size:23px;
            line-height:1.3;font-weight:600;letter-spacing:-.35px;overflow-wrap:anywhere;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-page-header {padding:0}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-page-header-main {vertical-align:top}
        html[data-jlw="on"] :is(#issue-content,#issue-view) a {color:var(--jlw-accent)}
        html[data-jlw="on"] :is(#issue-content,#issue-view) a:hover {color:#d2caff}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .issue-header .breadcrumbs {color:var(--jlw-muted);font-size:11px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .issue-header .breadcrumbs a {color:var(--jlw-muted)}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .command-bar {margin-top:10px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-button {
            height:auto;min-height:28px;border:1px solid #45464c;border-radius:5px;padding:3px 9px;
            background:#2c2d31;color:#e4e5e7;font-size:12px;font-weight:400;box-shadow:none;text-shadow:none;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-button:hover {background:#38393f}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-button-primary {
            background:#7969c8;border-color:#8b7bda;color:#fff;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(
            .issue-body-content:has(> .issue-main-column):has(> .issue-side-column),
            .issue-body-content:has(> #viewissuesidebar),
            .aui-group:has(> #viewissuesidebar)
        ) {display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:24px;align-items:start}
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(.issue-main-column,.issue-side-column,#viewissuesidebar) {
            box-sizing:border-box;min-width:0;width:auto;float:none;padding:0;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(.issue-side-column,#viewissuesidebar) {
            border-left:1px solid var(--jlw-line);padding-left:18px;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .module {
            margin:0 0 var(--jlw-space);padding:0;border:0;border-bottom:1px solid var(--jlw-line);
            border-radius:0;background:transparent;box-shadow:none;scroll-margin-top:12px;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .module > .mod-header {
            position:relative;margin:0;padding:8px 0 3px;border:0;background:transparent;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .module > .mod-header :is(h2,h3) {
            margin:0;color:var(--jlw-muted);font-size:11px;line-height:1.5;font-weight:600;letter-spacing:.6px;text-transform:uppercase;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .module > .mod-content {
            padding:var(--jlw-card-space) 0;margin:0;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) .property-list {margin:0}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .property-list > li {padding-top:4px;padding-bottom:4px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .property-list .name {color:var(--jlw-muted);font-size:12px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .property-list .value {overflow-wrap:anywhere}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-lozenge {
            border-radius:4px;background:#303137;border-color:#4b4d56;color:#d0d1d7;font-size:10px;letter-spacing:.2px;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(.aui-lozenge-success,.jira-issue-status-lozenge-green) {background:#213f31;border-color:#3d6650;color:#a4d9b8}
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(.aui-lozenge-current,.jira-issue-status-lozenge-blue) {background:#27394d;border-color:#405b79;color:#b1c9f3}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-lozenge-error {background:#472b31;border-color:#71424b;color:#f0b3bb}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-lozenge-moved {background:#443825;border-color:#6e5939;color:#e2c38c}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .aui-lozenge-complete {background:#353047;border-color:#5d527c;color:#d1c0fa}
        html[data-jlw="on"] :is(#issue-content,#issue-view) #description-val {line-height:1.55;overflow-wrap:anywhere}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .wiki-content :is(p,ul,ol) {margin-top:0;margin-bottom:8px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .wiki-content :is(img,video) {max-width:100%;height:auto}
        html[data-jlw="on"] :is(#issue-content,#issue-view) .wiki-content :is(pre,table) {max-width:100%;overflow-x:auto}
        html[data-jlw="on"] :is(#issue-content,#issue-view) #attachmentmodule .attachment-drop-zone {
            border:1px dashed #484a52;border-radius:5px;background:transparent;padding:10px;color:var(--jlw-muted);
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) #activitymodule .tabs-menu {
            display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px;border-bottom:1px solid var(--jlw-line);background:transparent;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) #activitymodule .tabs-menu > li {float:none}
        html[data-jlw="on"] :is(#issue-content,#issue-view) #activitymodule .tabs-menu a {padding:5px 8px;font-size:12px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) #activitymodule .issue-data-block {
            padding:10px 0;border-bottom:1px solid var(--jlw-line);background:transparent;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) #activitymodule .action-head {color:var(--jlw-muted);font-size:12px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) #activitymodule .action-body {margin-top:5px;line-height:1.5;overflow-wrap:anywhere}
        html[data-jlw="on"][data-jlw-density="compact"] :is(#issue-content,#issue-view) .property-list > li {padding-top:2px;padding-bottom:2px}
        html[data-jlw="on"][data-jlw-density="compact"] #details-module > .mod-content > .property-list {
            display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px;
        }
        html[data-jlw="on"][data-jlw-density="compact"] #details-module > .mod-content > .property-list > li {width:auto;min-width:0;float:none}
        html[data-jlw="on"][data-jlw-density="compact"] :is(#issue-content,#issue-view) .module > .mod-header {padding-top:6px;padding-bottom:2px}
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(textarea,select,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])) {
            background:#252628;color:var(--jlw-ink);border:1px solid #484a52;border-radius:5px;
        }
        html[data-jlw="on"] :is(#issue-content,#issue-view) textarea {min-height:60px;padding:8px;font:inherit}
        html[data-jlw="on"] :is(#issue-content,#issue-view) :is(textarea,input)::placeholder {color:#92959f}
        html[data-jlw="on"] :is(.aui-dialog2,.jira-dialog,dialog,.aui-dropdown2,.select2-drop) {
            background:#252628;color:var(--jlw-ink);border-color:#484a52;
        }
        html[data-jlw="on"] :is(.aui-dialog2-header,.aui-dialog2-content,.aui-dialog2-footer,.jira-dialog .jira-dialog-heading) {
            background:#252628;color:var(--jlw-ink);border-color:#484a52;
        }
        html[data-jlw="on"] :is(.aui-dialog2-header-main,.jira-dialog h2,dialog h2) {color:var(--jlw-ink)}
        html[data-jlw="on"] :is(.aui-dialog2,.jira-dialog,dialog) :is(textarea,input[type=text],select) {
            background:#1e1f21;color:var(--jlw-ink);border:1px solid #484a52;border-radius:4px;
        }
        html[data-jlw="on"] :is(.aui-dropdown2,.select2-drop) a {color:#e4e5e7}
        html[data-jlw="on"] :is(.aui-dropdown2,.select2-drop) a:hover {background:#38393f}
        html[data-jlw="on"] #jira-direct-timer {background:#2d2428;border-color:#634149;color:#e4e5e7;box-shadow:0 4px 16px #0003}
        html[data-jlw="on"] #jira-direct-timer[data-running="true"] {background:#222e29;border-color:#41634f}
        html[data-jlw="on"] #jira-direct-timer[data-other="true"] {background:#232d3d;border-color:#445d80}
        html[data-jlw="on"] #jira-direct-timer [data-clock] {color:#f0b3bb}
        html[data-jlw="on"] #jira-direct-timer[data-running="true"] [data-clock] {color:#a4d9b8}
        html[data-jlw="on"] #jira-direct-timer[data-other="true"] [data-clock] {color:#b1c9f3}
        html[data-jlw="on"] #jira-direct-timer :is(strong,[data-status]) {color:#b2b5bf}
        html[data-jlw="on"] #jira-direct-timer :is(a[data-measuring],[data-toast-issue]) {color:#b1c9f3}
        html[data-jlw="on"] #jira-direct-timer :is(input,button:not([data-start]):not([data-stop])) {
            background:#303136;color:#e4e5e7;border-color:#54565e;
        }
        html[data-jlw="on"] #jira-direct-timer [data-toast] {background:#292a2e;border-color:#484a52;color:#e4e5e7;box-shadow:0 4px 16px #0003}
        html[data-jlw="on"] #jira-direct-timer [data-toast] strong {color:#a4d9b8}
        html[data-jlw="on"] #jira-direct-timer [data-toast="discarded"] strong {color:#d0b29d}
        html[data-jlw="on"] #jira-direct-timer [data-toast] a:last-child {color:#b2b5bf}
        html[data-jlw="on"] #jira-direct-timer [data-error] {color:#ffadaf}
        @media (max-width:1100px) {
            html[data-jlw="on"] :is(#issue-content,#issue-view) :is(
                .issue-body-content:has(> .issue-main-column):has(> .issue-side-column),
                .issue-body-content:has(> #viewissuesidebar),
                .aui-group:has(> #viewissuesidebar)
            ) {grid-template-columns:minmax(0,1fr)}
            html[data-jlw="on"] :is(#issue-content,#issue-view) :is(.issue-side-column,#viewissuesidebar) {padding-left:0;border-left:0}
        }
        @media (max-width:600px) {
            #jira-local-workspace-toolbar {margin:0;padding:8px 10px;gap:6px}
            #jira-local-workspace-toolbar nav {flex-basis:100%;order:3}
            #jira-local-workspace-toolbar [data-controls] {margin-left:0}
            html[data-jlw="on"] :is(#issue-content,#issue-view) {padding:12px 10px 24px}
            html[data-jlw="on"] #summary-val {font-size:21px}
            html[data-jlw="on"][data-jlw-density="compact"] #details-module > .mod-content > .property-list {grid-template-columns:minmax(0,1fr)}
            html[data-jlw="on"] :is(#issue-content,#issue-view) .command-bar {display:flex;flex-wrap:wrap;gap:6px}
        }
        @media print {
            #jira-local-workspace-toolbar {display:none}
            html[data-jlw="on"] {color-scheme:light;--jlw-bg:#fff;--jlw-ink:#111;--jlw-muted:#444;--jlw-line:#ccc;--jlw-accent:#333}
            html[data-jlw="on"] :is(#issue-content,#issue-view) {max-width:none;padding:0}
            html[data-jlw="on"] :is(#issue-content,#issue-view) .module {box-shadow:none;break-inside:avoid}
        }
    `;
    document.head.appendChild(style);

    const toolbar = document.createElement('section');
    toolbar.id = 'jira-local-workspace-toolbar';
    toolbar.setAttribute('aria-label', 'Jira Local Workspace');
    toolbar.innerHTML = '<div data-brand><strong>Local workspace</strong></div><nav aria-label="Sekce ukolu"></nav><div data-controls><button type="button" data-density>Kompaktni</button><button type="button" data-toggle>Puvodni vzhled</button></div><p data-error role="alert" hidden></p>';
    const navigation = toolbar.querySelector('nav');
    const density = toolbar.querySelector('[data-density]');
    const toggle = toolbar.querySelector('[data-toggle]');
    const errorMessage = toolbar.querySelector('[data-error]');
    density.onclick = () => {
        preferences.compact = !preferences.compact;
        savePreferences();
    };
    toggle.onclick = () => {
        preferences.enabled = !preferences.enabled;
        savePreferences();
    };

    function findRoot() {
        const selected = new URLSearchParams(location.search).get('selectedIssue');
        const onIssue = /^\/browse\/[A-Z][A-Z0-9_]*-\d+\/?$/.test(location.pathname) ||
            /^[A-Z][A-Z0-9_]*-\d+$/.test(selected || '');
        if (!onIssue) return null;
        const summary = document.querySelector('#summary-val');
        return summary && summary.textContent.trim() ? summary.closest('#issue-content, #issue-view') : null;
    }
    function sync() {
        scheduled = false;
        const root = findRoot();
        if (root !== currentRoot || (root && toolbar.nextElementSibling !== root)) {
            toolbar.remove();
            currentSections = [];
            currentRoot = root;
            if (root) root.before(toolbar);
        }
        if (!root) {
            document.documentElement.removeAttribute('data-jlw');
            document.documentElement.removeAttribute('data-jlw-density');
            return;
        }
        if (preferences.enabled) {
            document.documentElement.setAttribute('data-jlw', 'on');
            document.documentElement.setAttribute('data-jlw-density', preferences.compact ? 'compact' : 'comfortable');
        } else {
            document.documentElement.removeAttribute('data-jlw');
            document.documentElement.removeAttribute('data-jlw-density');
        }
        toggle.textContent = preferences.enabled ? 'Puvodni vzhled' : 'Novy vzhled';
        toggle.setAttribute('aria-pressed', String(preferences.enabled));
        density.setAttribute('aria-pressed', String(preferences.compact));
        density.disabled = !preferences.enabled;
        errorMessage.textContent = storageError;
        errorMessage.hidden = !storageError;

        const available = sections.flatMap(([id, fallback]) => {
            const target = root.querySelector(`#${id}`);
            if (!target || target.hidden) return [];
            const heading = target.querySelector('.mod-header h2, .mod-header h3');
            return [{target, label: heading?.textContent.trim() || fallback}];
        });
        if (available.length === currentSections.length &&
            available.every((entry, index) => entry.target === currentSections[index].target && entry.label === currentSections[index].label)) return;
        currentSections = available;
        navigation.replaceChildren();
        for (const {target, label} of available) {
            const link = document.createElement('a');
            link.href = `#${target.id}`;
            link.textContent = label;
            link.onclick = event => {
                event.preventDefault();
                target.scrollIntoView({behavior: 'instant', block: 'start'});
            };
            navigation.appendChild(link);
        }
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(sync);
    }
    function owned(node) {
        const element = node.nodeType === 1 ? node : node.parentElement;
        return !!element?.closest('#jira-local-workspace-toolbar, #jira-direct-timer, #jira-local-workspace-style');
    }
    const observer = new MutationObserver(records => {
        if (records.some(record => !owned(record.target) &&
            (record.type === 'characterData' || [...record.addedNodes, ...record.removedNodes].some(node => !owned(node))))) schedule();
    });
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('storage', event => {
        if (event.key !== KEY && event.key !== null) return;
        preferences = loadPreferences();
        sync();
    });
    sync();
})();
