// ==UserScript==
// @name         Jira direct worklog timer
// @namespace    alza.jira-direct-timer
// @version      1.1
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
    panel.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:10000;background:white;color:#172b4d;border:2px solid #0052cc;border-radius:8px;padding:14px;width:310px;box-shadow:0 3px 15px #0003;font:14px sans-serif';
    panel.innerHTML = '<strong>Jira stopky (bez Clockify)</strong><div data-status style="margin:10px 0;white-space:pre-wrap"></div><button data-start>Start na tomto ukolu</button> <button data-stop>Zastavit</button><div data-save-row style="margin-top:8px"><button data-save>Ulozit do Jira worklogu</button></div><div data-error role="alert" style="color:#ae2a19;margin-top:8px;white-space:pre-wrap"></div><small>Bez synchronizace do Clockify. Pouzivej jen jedny stopky.</small>';
    document.body.appendChild(panel);
    const status = panel.querySelector('[data-status]');
    const error = panel.querySelector('[data-error]');
    const start = panel.querySelector('[data-start]');
    const stop = panel.querySelector('[data-stop]');
    const save = panel.querySelector('[data-save]');
    let busy = false;
    let notice = '';

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
        const value = (location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/) || [])[1] || meta && meta.content;
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
            const active = value && value.phase !== 'saved';
            const seconds = value ? (value.phase === 'saved' && Number.isFinite(value.recordedSeconds) ? value.recordedSeconds : duration(value)) : 0;
            const clock = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
            status.textContent = value ? `${value.issue} | ${clock}\n${{running: 'Bezi', stopped: 'Zastaveno, zatim neulozeno', pending: 'Nejisty vysledek zapisu. Over ulozeni tlacitkem nize.', saved: 'Ulozeno do Jiry'}[value.phase]}` : 'Pripraveno. Pred Start zastav jine stopky.';
            const switching = active && value.issue !== issue();
            start.disabled = busy || !issue() || (!!active && !switching);
            start.textContent = switching ? `Prepnout na ${issue()} (ulozi ${value.issue})` : 'Start na tomto ukolu';
            stop.disabled = busy || !value || value.phase !== 'running';
            save.disabled = busy || !value || !['stopped', 'pending'].includes(value.phase);
            save.textContent = value && value.phase === 'pending' ? 'Overit predchozi zapis (bez opakovani)' : 'Ulozit do Jira worklogu';
            error.textContent = notice;
        } catch (e) {
            start.disabled = stop.disabled = save.disabled = true;
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
        if (old && old.phase !== 'saved') {
            if (old.issue === key) throw new Error('Tento ukol uz ma rozpracovane stopky.');
            if (old.phase === 'running') {
                if (duration(old) < 60) throw new Error('Predchozi mereni je kratsi nez minuta. Jira ho neulozi; stopky pokracuji na puvodnim ukolu.');
                old.ended = Date.now();
                old.phase = 'stopped';
            }
            old.nextIssue = key;
            write(old);
            await saveEntry(old, false);
            write({id: crypto.randomUUID(), issue: key, started: old.ended, ended: null, phase: 'running'});
            return;
        }
        if (!confirm(`Spustit stopky pro ${key}? Nejprve zastav ostatni stopky (vcetne Clockify), aby nevznikl prekryv.`)) return;
        write({id: crypto.randomUUID(), issue: key, started: Date.now(), ended: null, phase: 'running'});
    });
    stop.onclick = () => act(async () => {
        const value = read();
        if (!value || value.phase !== 'running') throw new Error('Stopky uz nebezi.');
        value.ended = Date.now();
        value.phase = 'stopped';
        write(value);
    });
    async function saveEntry(value, askConfirmation) {
        if (!value || !['stopped', 'pending'].includes(value.phase)) throw new Error('Neni co ulozit.');
        if (value.phase === 'stopped' && duration(value) < 60) {
            throw new Error('Tato Jira neprijima zaznam pod 1 minutu. Cas nenavysuji; pouzij standardni Log work pro skutecnou praci.');
        }
        const existing = await findSaved(value);
        if (existing) {
            value.phase = 'saved';
            value.worklogId = existing.id;
            value.recordedSeconds = existing.timeSpentSeconds;
            write(value);
            return;
        }
        if (value.phase === 'pending') throw new Error('Zapis zatim nebyl nalezen. Automaticky ho neopakuji; over Work log v Jire.');
        const seconds = Math.floor(duration(value) / 60) * 60;
        if (askConfirmation && !confirm(`Zapsat ${seconds / 60} celych minut do ${value.issue}? Jira uklada cas po minutach; zbyvajici sekundy se nezapisi. Nevytvarej stejny zaznam pres Clockify. Odhad zbyvajici prace se nezmeni.`)) return;
        value.phase = 'pending';
        write(value);
        const body = await request(`/rest/api/2/issue/${encodeURIComponent(value.issue)}/worklog?adjustEstimate=leave`, {
            method: 'POST',
            body: JSON.stringify({started: stamp(value.started), timeSpentSeconds: seconds, comment: `Prace na ukolu (Jira stopky)\n[jira-direct-timer:${value.id}]`})
        });
        if (!body.id) throw new Error('Jira nevratila ID noveho worklogu. Over predchozi zapis.');
        value.phase = 'saved';
        value.worklogId = body.id;
        value.recordedSeconds = body.timeSpentSeconds;
        write(value);
    }
    save.onclick = () => act(async () => {
        const value = read();
        await saveEntry(value, true);
        if (value.phase === 'saved' && value.nextIssue) {
            write({id: crypto.randomUUID(), issue: value.nextIssue, started: value.ended, ended: null, phase: 'running'});
        }
    });
    window.addEventListener('storage', event => { if (event.key === KEY) render(); });
    setInterval(render, 1000);
    render();
})();
