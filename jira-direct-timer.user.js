// ==UserScript==
// @name         Jira direct worklog timer
// @namespace    alza.jira-direct-timer
// @version      1.12
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
    `;
    document.body.appendChild(styles);
    panel.innerHTML = '<strong>Jira stopky (bez Clockify)</strong><a data-measuring hidden></a><a data-issue></a><a data-title></a><time data-clock>00:00:00</time><div data-status></div><div data-actions><button data-start>START</button><button data-stop>STOP</button></div><div data-save-row><button data-save>Ulozit do Jira worklogu</button></div><div data-error role="alert"></div>';
    document.body.appendChild(panel);
    const manualRow = document.createElement('div');
    manualRow.dataset.manualRow = '';
    manualRow.innerHTML = '<label>ADD MINUTES <input data-minutes type="number" min="1" step="1"></label><button data-manual>Zapsat do tohoto ukolu</button>';
    panel.appendChild(manualRow);
    const status = panel.querySelector('[data-status]');
    const error = panel.querySelector('[data-error]');
    const start = panel.querySelector('[data-start]');
    const stop = panel.querySelector('[data-stop]');
    const cancel = document.createElement('button');
    cancel.dataset.cancel = '';
    cancel.hidden = true;
    stop.after(cancel);
    const save = panel.querySelector('[data-save]');
    const minutes = panel.querySelector('[data-minutes]');
    const manual = panel.querySelector('[data-manual]');
    let busy = false;
    let notice = '';
    const titles = new Map();
    const titleRequests = new Set();

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
        return Math.max(1, Math.floor(((value.ended === null ? Date.now() : value.ended) - value.started) / 1000));
    }
    function stamp(ms) {
        const date = new Date(ms);
        if (!Number.isFinite(date.getTime())) throw new Error('Neplatny cas zacatku.');
        return date.toISOString().replace('Z', '+0000');
    }
    function render() {
        try {
            const value = read();
            const queuedManual = value && value.manualNext;
            const active = value && (value.phase !== 'saved' || queuedManual);
            const recentCompletion = value && value.phase === 'saved' && Number.isFinite(value.completedAt) &&
                Date.now() - value.completedAt >= 0 && Date.now() - value.completedAt < 5000;
            const displayValue = value && (value.phase !== 'saved' || queuedManual || recentCompletion) ? value : null;
            const seconds = displayValue ? (displayValue.phase === 'saved' && Number.isFinite(displayValue.recordedSeconds) ? displayValue.recordedSeconds : duration(displayValue)) : 0;
            const clock = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
            const title = displayValue ? titleFor(displayValue) : '';
            const stateText = displayValue ? {running: '', stopped: 'Zastaveno, zatim neulozeno', pending: 'Nejisty vysledek zapisu. Over ulozeni tlacitkem nize.', saved: 'Ulozeno do Jiry'}[displayValue.phase] : '';
            panel.dataset.running = String(!!value && value.phase === 'running');
            const other = !!value && value.phase === 'running' && value.issue !== issue();
            panel.dataset.other = String(other);
            const measuring = panel.querySelector('[data-measuring]');
            measuring.hidden = !other;
            measuring.textContent = other ? `Nyn\u00ed se m\u011b\u0159\u00ed: ${value.issue}` : '';
            panel.querySelector('[data-issue]').textContent = displayValue ? displayValue.issue : '';
            panel.querySelector('[data-issue]').hidden = other || !displayValue;
            panel.querySelector('[data-clock]').textContent = clock;
            panel.querySelector('[data-title]').textContent = title;
            for (const selector of ['[data-issue]', '[data-title]', '[data-measuring]']) {
                panel.querySelector(selector).href = displayValue ? `https://jira.alza.cz/browse/${encodeURIComponent(displayValue.issue)}` : '';
            }
            status.textContent = displayValue ? stateText : 'Nyn\u00ed se nic nem\u011b\u0159\u00ed.';
            if (queuedManual) status.textContent += `\nCeka rucni zapis do ${queuedManual.issue}. Dokonci tlacitkem Ulozit / Overit.`;
            const switching = active && value.issue !== issue();
            start.disabled = busy || !issue() || !!queuedManual || (!!active && !switching);
            start.textContent = 'START';
            stop.disabled = busy || !value || value.phase !== 'running';
            stop.textContent = 'STOP';
            cancel.hidden = !value || value.phase !== 'running';
            cancel.disabled = busy || cancel.hidden;
            cancel.textContent = 'CANCEL';
            save.disabled = busy || !value || (!['stopped', 'pending'].includes(value.phase) && !(value.phase === 'saved' && queuedManual));
            panel.querySelector('[data-save-row]').hidden = !value || (!['stopped', 'pending'].includes(value.phase) && !queuedManual);
            save.textContent = value && value.phase === 'pending' ? 'Overit predchozi zapis (bez opakovani)' : 'Ulozit do Jira worklogu';
            manual.disabled = busy || !issue() || !!queuedManual || !!(value && value.phase === 'pending');
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
        render();
        try {
            if (!navigator.locks) throw new Error('Prohlizec nepodporuje zamykani mezi kartami. Pouzij standardni Jira Log work.');
            await navigator.locks.request(KEY, {ifAvailable: true}, async lock => {
                if (!lock) throw new Error('Stopky prave meni jina karta. Zkus pozdeji.');
                await action();
            });
        } catch (e) {
            notice = `${e.message}\nCas zustava ulozeny v tomto prohlizeci. Neopakuj zapis jinym zpusobem bez kontroly duplicit.`;
        } finally {
            busy = false;
            render();
        }
    }
    start.onclick = () => act(async () => {
        const old = read();
        const key = issue();
        if (!key) throw new Error('Otevri konkretni ukol Jiry.');
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
        value.ended = Date.now();
        value.phase = 'stopped';
        write(value);
        await saveEntry(value);
    });
    cancel.onclick = () => act(async () => {
        const value = read();
        if (!value || value.phase !== 'running') throw new Error('Stopky uz nebezi.');
        localStorage.removeItem(KEY);
    });
    async function finishManual(value) {
        if (value.phase !== 'saved' || !value.manualNext) return;
        const entry = value.manualNext;
        write(entry);
        await saveEntry(entry);
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
        if (old && (old.phase === 'pending' || old.manualNext)) throw new Error('Nejprve over predchozi zapis.');
        const end = Date.now();
        const entry = {...newTimer(key, end - count * 60000), ended: end, phase: 'stopped', manual: true};
        if (old && old.phase !== 'saved') {
            if (old.phase === 'running') {
                old.ended = end;
                old.phase = 'stopped';
            }
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
    async function saveEntry(value) {
        if (!value || !['stopped', 'pending'].includes(value.phase)) throw new Error('Neni co ulozit.');
        const existing = await findSaved(value);
        if (existing) {
            value.phase = 'saved';
            value.worklogId = existing.id;
            value.recordedSeconds = existing.timeSpentSeconds;
            value.completedAt = Date.now();
            write(value);
            return;
        }
        if (value.phase === 'pending') throw new Error('Zapis zatim nebyl nalezen. Automaticky ho neopakuji; over Work log v Jire.');
        const measuredSeconds = duration(value);
        const seconds = Math.max(60, Math.floor(measuredSeconds / 60) * 60);
        value.phase = 'pending';
        write(value);
        const body = await request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}/worklog?adjustEstimate=leave`, {
            method: 'POST',
            body: JSON.stringify({started: stamp(value.started), timeSpentSeconds: seconds, comment: `${value.manual ? 'Rucni vykaz (Jira stopky)' : 'Prace na ukolu (Jira stopky)'}${measuredSeconds < 60 ? `\nMereno ${measuredSeconds} s; ulozeno minimum 1 minuta.` : ''}\n[jira-direct-timer:${value.id}]`})
        });
        if (!body.id) throw new Error('Jira nevratila ID noveho worklogu. Over predchozi zapis.');
        value.phase = 'saved';
        value.worklogId = body.id;
        value.recordedSeconds = body.timeSpentSeconds;
        value.completedAt = Date.now();
        write(value);
    }
    save.onclick = () => act(async () => {
        const value = read();
        if (!(value && value.phase === 'saved' && value.manualNext)) await saveEntry(value);
        await finishManual(value);
        if (value.phase === 'saved' && value.nextIssue) {
            write(newTimer(value.nextIssue, value.ended));
        }
    });
    window.addEventListener('storage', event => { if (event.key === KEY) render(); });
    setInterval(render, 1000);
    render();
})();
