// ==UserScript==
// @name         Jira direct worklog timer
// @namespace    alza.jira-direct-timer
// @version      1.15.2
// @description  Persistent stopwatch that saves directly to Jira, without Clockify.
// @match        https://jira.alza.cz/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.top !== window || document.getElementById('jira-direct-timer')) return;
    const KEY = 'jira-direct-timer-v1';
    const panel = document.createElement('section');
    panel.id = 'jira-direct-timer';
    const styles = document.createElement('style');
    styles.textContent = `
        #jira-direct-timer {position:fixed;left:20px;bottom:20px;z-index:10000;width:240px;max-width:calc(100vw - 40px);box-sizing:border-box;padding:14px;border:1px solid #e4b9b9;border-radius:12px;background:#fff2f2;color:#253249;box-shadow:0 6px 24px #172b4d24;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #jira-direct-timer[data-running="true"] {background:#effaf2;border-color:#a6d8b4}
        #jira-direct-timer[data-other="true"] {background:#edf4ff;border-color:#9abce8}
        #jira-direct-timer strong {display:block;font-size:12px;font-weight:600;color:#526078;margin-bottom:10px}
        #jira-direct-timer [data-clock] {display:block;font-size:34px;line-height:1.2;font-weight:750;letter-spacing:1px;font-variant-numeric:tabular-nums;color:#8d3030;margin:4px 0 8px}
        #jira-direct-timer[data-running="true"] [data-clock] {color:#176538}
        #jira-direct-timer[data-other="true"] [data-clock] {color:#20559a}
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
        #jira-direct-timer label {display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;font-weight:700;letter-spacing:.4px}
        #jira-direct-timer input {box-sizing:border-box;width:70px;min-width:0;padding:6px;border:1px solid #b9c4d2;border-radius:6px;background:#fff;color:#253249;font-family:inherit;font-size:13px}
        #jira-direct-timer [data-manual] {width:100%;margin-top:7px}
        #jira-direct-timer [data-error] {color:#ae2a19;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}
        #jira-direct-timer [data-error]:not(:empty) {margin-top:8px}
        #jira-direct-timer [data-toasts] {position:absolute;left:-1px;right:-1px;bottom:calc(100% + 12px);display:flex;flex-direction:column;gap:10px;overflow:visible}
        #jira-direct-timer [data-toast] {padding:14px;border:1px solid #dfe3e8;border-radius:10px;background:#fff;color:#253249;box-shadow:0 4px 16px #172b4d18;font-size:12px;line-height:1.5;overflow-wrap:anywhere;animation:jira-direct-timer-toast 5s ease-in-out both}
        #jira-direct-timer [data-toast] strong {display:flex;align-items:center;gap:7px;margin-bottom:8px;color:#23734a;font-size:12px;font-weight:600;letter-spacing:0}
        #jira-direct-timer [data-toast] strong::before {content:'';width:7px;height:7px;flex-shrink:0;border-radius:50%;background:currentColor}
        #jira-direct-timer [data-toast="discarded"] strong {color:#8a6150}
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
        }
    `;
    document.body.appendChild(styles);
    panel.innerHTML = '<strong>Jira stopky</strong><a data-measuring hidden></a><a data-issue></a><a data-title></a><time data-clock>00:00:00</time><div data-status></div><div data-actions><button data-start>START</button><button data-stop>STOP</button></div><div data-save-row><button data-save>Ulozit do Jira worklogu</button></div><div data-error role="alert"></div>';
    document.body.appendChild(panel);
    const manualRow = document.createElement('div');
    manualRow.dataset.manualRow = '';
    manualRow.innerHTML = '<label>ADD MINUTES <input data-minutes type="number" min="1" step="1"></label><button data-manual>ADD MINUTES</button>';
    panel.appendChild(manualRow);
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
    let busy = false;
    let actionDisplay = null;
    let notice = '';
    const titles = new Map();
    const titleRequests = new Set();
    let notifications = [];

    function formatDuration(seconds) {
        return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
    }
    function showToast(value, discarded = false) {
        const node = document.createElement('div');
        node.dataset.toast = discarded ? 'discarded' : 'saved';
        const heading = document.createElement('strong');
        heading.textContent = discarded ? 'Zahozeno' : 'Zaznamen\u00e1no';
        const details = document.createElement('a');
        details.href = `https://jira.alza.cz/browse/${encodeURIComponent(value.issue)}`;
        const seconds = discarded ? duration(value) : value.recordedSeconds;
        details.setAttribute('aria-label', `${formatDuration(seconds)} ${discarded ? 'z' : 'do'} tasku ${value.issue}`);
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
        node.appendChild(heading);
        node.appendChild(details);
        node.appendChild(title);
        toasts.appendChild(node);
        notifications.push({node, title, value, expiresAt: Date.now() + 5000});
    }
    function renderToasts() {
        notifications = notifications.filter(notification => {
            if (Date.now() >= notification.expiresAt) {
                notification.node.remove();
                return false;
            }
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
                    if (typeof body.fields?.summary !== 'string') throw new Error('Jira nevratila nazev ukolu.');
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

    function read() {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || !/^[A-Z][A-Z0-9_]*-\d+$/.test(value.issue) ||
            typeof value.id !== 'string' || !Number.isFinite(value.started) ||
            (value.ended !== null && (!Number.isFinite(value.ended) || value.ended < value.started)) ||
            !['running', 'stopped', 'pending', 'saved'].includes(value.phase)) {
            throw new Error('Ulozeny stav stopek je poskozeny. Nemaz data; je nutna kontrola.');
        }
        return value;
    }
    function write(value) {
        localStorage.setItem(KEY, JSON.stringify(value));
    }
    function issue() {
        const meta = document.querySelector('meta[name="ajs-issue-key"]');
        const selected = new URLSearchParams(location.search).get('selectedIssue');
        const value = selected || (location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/) || [])[1] || meta && meta.content;
        return /^[A-Z][A-Z0-9_]*-\d+$/.test(value || '') ? value : null;
    }
    function duration(value) {
        return Math.max(0, Math.floor(((value.ended === null ? Date.now() : value.ended) - value.started) / 1000));
    }
    function stamp(ms) {
        const date = new Date(ms);
        if (!Number.isFinite(date.getTime())) throw new Error('Neplatny cas zacatku.');
        return date.toISOString().replace('Z', '+0000');
    }
    function render() {
        try {
            renderToasts();
            const value = busy ? actionDisplay : read();
            const currentIssue = issue();
            const independentManual = value && value.manualEntry;
            const queuedManual = value && value.manualNext;
            const active = value && (value.phase !== 'saved' || queuedManual);
            const displayValue = value && value.phase !== 'saved' ? value : null;
            const seconds = displayValue ? duration(displayValue) : 0;
            const title = displayValue ? titleFor(displayValue) : '';
            const stateText = displayValue ? {running: '', stopped: 'Zastaveno, zatim neulozeno', pending: 'Nejisty vysledek zapisu. Over ulozeni tlacitkem nize.'}[displayValue.phase] : '';
            panel.dataset.running = String(!!value && value.phase === 'running');
            const other = !!value && value.phase === 'running' && value.issue !== currentIssue;
            panel.dataset.other = String(other);
            measuring.hidden = !other;
            measuring.textContent = other ? `Nyn\u00ed se m\u011b\u0159\u00ed: ${value.issue}` : '';
            issueLink.textContent = displayValue ? displayValue.issue : '';
            issueLink.hidden = other || !displayValue;
            clock.textContent = formatDuration(seconds);
            titleLink.textContent = title;
            for (const link of [issueLink, titleLink, measuring]) {
                link.href = displayValue ? `https://jira.alza.cz/browse/${encodeURIComponent(displayValue.issue)}` : '';
            }
            status.textContent = displayValue ? stateText : 'Nyn\u00ed se nic nem\u011b\u0159\u00ed.';
            if (queuedManual) status.textContent += `\nCeka rucni zapis do ${queuedManual.issue}. Dokonci tlacitkem Ulozit / Overit.`;
            if (independentManual) status.textContent += `\nCeka rucni zapis do ${independentManual.issue}. Dokonci tlacitkem Ulozit / Overit.`;
            const switching = active && value.issue !== currentIssue;
            start.disabled = busy || !currentIssue || !!queuedManual || !!independentManual || (!!active && !switching);
            stop.disabled = busy || !!independentManual || !value || value.phase !== 'running';
            cancel.hidden = !value || value.phase !== 'running';
            cancel.disabled = busy || !!independentManual || cancel.hidden;
            save.disabled = busy || !value || (!['stopped', 'pending'].includes(value.phase) && !(value.phase === 'saved' && queuedManual) && !independentManual);
            saveRow.hidden = !value || (!['stopped', 'pending'].includes(value.phase) && !queuedManual && !independentManual);
            save.textContent = value && (value.phase === 'pending' || independentManual?.phase === 'pending') ? 'Overit predchozi zapis (bez opakovani)' : 'Ulozit do Jira worklogu';
            manual.disabled = busy || !currentIssue || !!queuedManual || !!independentManual || !!(value && value.phase === 'pending');
            minutes.disabled = busy;
            error.textContent = notice;
        } catch (e) {
            panel.dataset.running = 'false';
            panel.dataset.other = 'false';
            start.disabled = stop.disabled = save.disabled = true;
            manual.disabled = true;
            cancel.hidden = true;
            cancel.disabled = true;
            error.textContent = e.message;
        }
    }
    async function request(path, options) {
        const response = await fetch(path, {...options, credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}});
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
        let offset = 0;
        while (true) {
            const body = await request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}/worklog?startAt=${offset}&maxResults=100`);
            if (!Array.isArray(body.worklogs) || !Number.isFinite(body.total)) throw new Error('Neocekavana odpoved Jira worklogu.');
            const match = body.worklogs.find(w => typeof w.comment === 'string' && w.comment.includes(marker));
            if (match) return match;
            offset += body.worklogs.length;
            if (offset >= body.total) return null;
            if (!body.worklogs.length) throw new Error('Jira nevratila vsechny zaznamy. Zapis nebyl opakovan.');
        }
    }
    async function act(action) {
        if (busy) return;
        busy = true;
        notice = '';
        try {
            actionDisplay = read();
            render();
            if (!navigator.locks) throw new Error('Prohlizec nepodporuje zamykani mezi kartami. Pouzij standardni Jira Log work.');
            await navigator.locks.request(KEY, {ifAvailable: true}, async lock => {
                if (!lock) throw new Error('Stopky prave meni jina karta. Zkus pozdeji.');
                await action();
            });
        } catch (e) {
            notice = `${e.message}\nCas zustava ulozeny v tomto prohlizeci. Neopakuj zapis jinym zpusobem bez kontroly duplicit.`;
        } finally {
            busy = false;
            actionDisplay = null;
            render();
        }
    }
    start.onclick = () => act(async () => {
        const old = read();
        const key = issue();
        if (!key) throw new Error('Otevri konkretni ukol Jiry.');
        if (old && old.manualEntry) throw new Error('Nejprve dokoncit rozpracovany rucni zapis tlacitkem Ulozit / Overit.');
        if (old && old.manualNext) throw new Error('Nejprve dokoncit rozpracovany rucni zapis tlacitkem Ulozit.');
        if (old && old.phase !== 'saved') {
            if (old.issue === key) throw new Error('Tento ukol uz ma rozpracovane stopky.');
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
    });
    stop.onclick = () => act(async () => {
        const value = read();
        if (!value || value.phase !== 'running') throw new Error('Stopky uz nebezi.');
        if (value.manualEntry) throw new Error('Nejprve dokoncit rozpracovany rucni zapis tlacitkem Ulozit / Overit.');
        value.ended = Date.now();
        value.phase = 'stopped';
        write(value);
        await saveEntry(value);
    });
    cancel.onclick = () => act(async () => {
        const value = read();
        if (!value || value.phase !== 'running') throw new Error('Stopky uz nebezi.');
        if (value.manualEntry) throw new Error('Nejprve dokoncit rozpracovany rucni zapis tlacitkem Ulozit / Overit.');
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
    manual.onclick = () => act(async () => {
        const key = issue();
        const count = Number(minutes.value);
        if (!key) throw new Error('Otevri konkretni ukol Jiry.');
        if (!/^\d+$/.test(minutes.value) || !Number.isSafeInteger(count) || count < 1 ||
            !Number.isSafeInteger(count * 60000) || !Number.isFinite(new Date(Date.now() - count * 60000).getTime())) {
            throw new Error('Zadej kladny cely pocet minut.');
        }
        const old = read();
        if (old && (old.phase === 'pending' || old.manualNext || old.manualEntry)) throw new Error('Nejprve over predchozi zapis.');
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
        minutes.value = '';
    });
    minutes.onkeydown = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!manual.disabled) return manual.onclick();
        }
    };
    async function saveEntry(value, persist = write) {
        if (!value || !['stopped', 'pending'].includes(value.phase)) throw new Error('Neni co ulozit.');
        let worklog = await findSaved(value);
        if (!worklog) {
            if (value.phase === 'pending') throw new Error('Zapis zatim nebyl nalezen. Automaticky ho neopakuji; over Work log v Jire.');
            const measuredSeconds = Math.max(1, duration(value));
            const seconds = Math.max(60, Math.floor(measuredSeconds / 60) * 60);
            value.phase = 'pending';
            persist(value);
            worklog = await request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}/worklog?adjustEstimate=leave`, {
                method: 'POST',
                body: JSON.stringify({started: stamp(value.started), timeSpentSeconds: seconds, comment: `${value.manual ? 'Rucni vykaz (Jira stopky)' : 'Prace na ukolu (Jira stopky)'}${measuredSeconds < 60 ? `\nMereno ${measuredSeconds} s; ulozeno minimum 1 minuta.` : ''}\n[jira-direct-timer:${value.id}]`})
            });
            if (!worklog.id) throw new Error('Jira nevratila ID noveho worklogu. Over predchozi zapis.');
        }
        value.phase = 'saved';
        value.worklogId = worklog.id;
        value.recordedSeconds = worklog.timeSpentSeconds;
        value.completedAt = Date.now();
        persist(value);
        showToast(value);
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
    window.addEventListener('storage', event => { if (event.key === KEY) render(); });
    setInterval(render, 100);
    render();
})();
