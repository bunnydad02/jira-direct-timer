'use strict';

(() => {
    const KEY = 'jira-direct-timer-v1';
    const AUTO_SETTINGS_KEY = 'jira-direct-timer-auto-settings-v1';
    const AUTO_QUEUE_KEY = 'jira-direct-timer-auto-queue-v1';
    const titles = {
        'DEMO-101': 'Testovaci task: implementace <bezpecny text>',
        'DEMO-102': 'Testovaci task: kontrola a opravy',
        'DEMO-103': 'Testovaci task: dokumentace',
        'DEMO-104': 'Testovaci task: automaticke vykazani'
    };
    const nativeDate = Date;
    let model;
    let interval;
    let render;
    let events;
    let timerWindow;
    const $ = selector => document.querySelector(selector);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const clone = value => JSON.parse(JSON.stringify(value));

    function inspect() {
        $('#state').textContent = model.raw || '(prazdny stav)';
        $('#worklogs').textContent = JSON.stringify(model.logs, null, 2);
        $('#requests').textContent = model.requests.map(value => `${value.method} ${value.path}`).join('\n') || '(zadne)';
    }
    function navigate(issue) {
        if (issue && !Object.hasOwn(titles, issue)) throw new Error(`Unknown fixture: ${issue}`);
        model.location.pathname = issue ? `/browse/${issue}` : '/dashboard';
        model.location.search = '';
        $('meta[name="ajs-issue-key"]').content = issue;
        $('#summary-val').textContent = titles[issue] || 'Prehled bez otevreneho tasku';
        $('#issue').value = issue;
        render?.();
    }
    function mount() {
        clearInterval(interval);
        $('#jira-direct-timer')?.remove();
        document.querySelectorAll('body > style').forEach(node => node.remove());
        events = new EventTarget();
        const current = model;
        const fakeWindow = {addEventListener: events.addEventListener.bind(events)};
        fakeWindow.top = fakeWindow;
        class Clock extends nativeDate {
            static now() { return nativeDate.now() + current.offset; }
        }
        const storage = {
            getItem(key) {
                if (key === KEY) return current.raw;
                if (key === AUTO_SETTINGS_KEY) return current.autoSettingsRaw;
                if (key === AUTO_QUEUE_KEY) return current.autoQueueRaw;
                throw new Error(`Unexpected storage key: ${key}`);
            },
            setItem(key, value) {
                if (key === KEY) current.raw = value;
                else if (key === AUTO_SETTINGS_KEY) current.autoSettingsRaw = value;
                else if (key === AUTO_QUEUE_KEY) current.autoQueueRaw = value;
                else throw new Error(`Unexpected storage key: ${key}`);
                inspect();
            },
            removeItem(key) {
                if (key === KEY) current.raw = null;
                else if (key === AUTO_SETTINGS_KEY) current.autoSettingsRaw = null;
                else if (key === AUTO_QUEUE_KEY) current.autoQueueRaw = null;
                else throw new Error(`Unexpected storage key: ${key}`);
                inspect();
            }
        };
        const mockFetch = async (path, options = {}) => {
            const method = options.method || 'GET';
            const myself = path === '/rest/api/2/myself' && method === 'GET';
            const createForm = path === '/secure/QuickCreateIssue.jspa';
            const createIssue = (path === '/rest/api/2/issue' || createForm) && method === 'POST';
            const match = /^\/rest\/api\/2\/issue\/(DEMO-10[1-4])(\?fields=summary|\?fields=subtasks|\/worklog\?.+)$/.exec(path);
            if ((!match && !myself && !createIssue) || !['GET', 'POST'].includes(method)) throw new Error(`Blocked unexpected mock API request: ${method} ${path}`);
            current.requests.push({method, path});
            current.active++;
            inspect();
            try {
                await sleep(current.latency);
                if (myself) {
                    if (current.identityError) throw new Error('Simulovana chyba identity uzivatele');
                    return {ok: true, json: async () => clone(current.user)};
                }
                if (createIssue) {
                    const body = createForm ? {issueKey: 'DEMO-104', issueId: '104'} : {key: 'DEMO-104'};
                    return {ok: true, clone: () => ({json: async () => body})};
                }
                const issue = match[1];
                if (match[2] === '?fields=summary') {
                    if (method !== 'GET') throw new Error('Summary fixture is read-only');
                    return {ok: true, json: async () => ({fields: {summary: titles[issue]}})};
                }
                if (match[2] === '?fields=subtasks') {
                    if (method !== 'GET') throw new Error('Subtasks fixture is read-only');
                    if (current.aggregateError) throw new Error('Simulovana chyba souhrnu subtasku');
                    const subtasks = Object.keys(current.parents).filter(key => current.parents[key] === issue).map(key => ({key}));
                    return {ok: true, json: async () => ({fields: {subtasks}})};
                }
                if (method === 'POST') {
                    if (match[2] !== '/worklog?adjustEstimate=leave') throw new Error('Estimate must be preserved');
                    const body = JSON.parse(options.body);
                    current.posts.push({issue, body, state: JSON.parse(current.raw)});
                    const failure = current.failure;
                    current.failure = 'none';
                    $('#failure').value = 'none';
                    if (failure === 'before') throw new Error('Simulovana ztrata spojeni pred ulozenim');
                    const log = {id: `mock-${current.logs.length + 1}`, issue, author: clone(current.user), ...body};
                    current.logs.push(log);
                    if (failure === 'after') throw new Error('Simulovana ztrata odpovedi po ulozeni');
                    return {ok: true, json: async () => clone(log)};
                }
                if (current.totalError || current.worklogErrorIssue === issue) throw new Error('Simulovana chyba nacteni worklogu');
                const logs = current.logs.filter(log => log.issue === issue);
                const offset = Number(new URLSearchParams(path.split('?')[1]).get('startAt'));
                return {ok: true, json: async () => ({total: logs.length, worklogs: clone(logs.slice(offset, offset + 2))})};
            } finally {
                current.active--;
                inspect();
            }
        };
        const navigatorMock = current.lock === 'missing' ? {} : {
            locks: {request: async (key, options, callback) => {
                if (key !== KEY || options.ifAvailable !== true) throw new Error('Unexpected lock contract');
                return callback(current.lock === 'busy' ? null : {});
            }}
        };
        timerWindow = fakeWindow;
        timerWindow.fetch = mockFetch;
        // Inject dependencies without changing the shipped userscript or browser globals.
        new Function('window', 'document', 'location', 'localStorage', 'fetch', 'Date', 'crypto', 'navigator', 'setInterval', window.timerSource)(
            fakeWindow, document, current.location, storage, mockFetch, Clock, crypto, navigatorMock,
            (callback, ms) => {
                render = callback;
                interval = setInterval(callback, ms);
            });
        inspect();
    }
    async function idle() {
        const deadline = nativeDate.now() + 5000;
        while (model.active || $('[data-minutes]').disabled) {
            if (nativeDate.now() > deadline) throw new Error('Timer action did not settle');
            await sleep(10);
        }
        await sleep(0);
    }
    async function reset(options = {}) {
        const user = options.user ?? {key: 'demo-user', name: 'demo', displayName: 'Demo User'};
        model = {
            raw: options.raw ?? (options.state ? JSON.stringify(options.state) : null),
            autoSettingsRaw: options.autoSettings ? JSON.stringify(options.autoSettings) : null,
            autoQueueRaw: options.autoQueue ? JSON.stringify(options.autoQueue) : null,
            logs: clone(options.logs || []).map(log => ({author: clone(user), ...log})), requests: [], posts: [], offset: 0, active: 0,
            latency: options.latency ?? 30, failure: 'none', lock: options.lock || 'available',
            totalError: options.totalError || false, location: {pathname: '', search: '', origin: 'https://jira.alza.cz',
                get href() { return `${this.origin}${this.pathname}${this.search}`; }},
            parents: clone(options.parents || {}), aggregateError: options.aggregateError || false,
            user: clone(user), identityError: options.identityError || false, worklogErrorIssue: options.worklogErrorIssue
        };
        render = null;
        navigate(options.issue ?? 'DEMO-101');
        $('#failure').value = 'none';
        $('#harness-error').textContent = $('#link-info').textContent = '';
        mount();
        await idle();
    }
    window.playground = {
        reset, idle, navigate, sleep,
        search(value) { model.location.search = value; render?.(); },
        node: name => $(`[data-${name}]`),
        panel: () => $('#jira-direct-timer'),
        state: () => model.raw ? JSON.parse(model.raw) : null,
        logs: () => clone(model.logs),
        posts: () => clone(model.posts),
        requests: () => clone(model.requests),
        now: () => nativeDate.now() + model.offset,
        advance(ms) { model.offset += ms; render(); },
        failure(value) { model.failure = value; $('#failure').value = value; },
        async reload() { mount(); await idle(); },
        async createIssue(subtask = false) {
            await timerWindow.fetch(subtask ? '/secure/QuickCreateIssue.jspa' : '/rest/api/2/issue',
                {method: 'POST', body: '{}'});
            await sleep(0);
            await idle();
            await sleep(0);
            await idle();
        },
        async click(name) {
            const node = this.node(name);
            if (node.disabled || node.hidden || node.closest('[hidden]')) throw new Error(`Unavailable action: ${name}`);
            node.click();
            await idle();
        },
        async manual(value, enter = false) {
            this.node('minutes').value = value;
            if (enter) this.node('minutes').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
            else this.node('manual').click();
            await idle();
        },
        externalState(value) {
            model.raw = JSON.stringify(value);
            events.dispatchEvent(new StorageEvent('storage', {key: KEY}));
            inspect();
        }
    };
    const report = error => { $('#harness-error').textContent = error.message; console.error(error); };
    $('#issue').onchange = event => navigate(event.target.value);
    $('#advance').onclick = () => window.playground.advance(125000);
    $('#failure').onchange = event => { model.failure = event.target.value; };
    $('#reload').onclick = () => window.playground.reload().catch(report);
    $('#reset').onclick = () => reset().catch(report);
    document.addEventListener('click', event => {
        const link = event.target.closest('#jira-direct-timer a');
        if (!link) return;
        event.preventDefault();
        $('#link-info').textContent = `Odkaz (bez externi navigace): ${link.href}`;
        const issue = new URL(link.href).pathname.match(/^\/browse\/(DEMO-10[123])$/)?.[1];
        if (issue) navigate(issue);
    });
    $('#run').onclick = async () => {
        const controls = [...document.querySelectorAll('main button, main select')];
        controls.forEach(node => { node.disabled = true; });
        $('#results').replaceChildren();
        let failures = 0;
        try {
            for (let index = 0; index < window.regression.scenarios.length; index++) {
                const item = document.createElement('li');
                item.textContent = window.regression.scenarios[index].title;
                $('#results').appendChild(item);
                $('#test-status').textContent = `Bezi: ${item.textContent}`;
                try {
                    await window.regression.run(index);
                    item.dataset.result = 'passed';
                    item.textContent += ' - OK';
                } catch (error) {
                    failures++;
                    item.dataset.result = 'failed';
                    item.textContent += ` - CHYBA: ${error.message}`;
                }
                await sleep(250);
            }
            $('#test-status').textContent = `Hotovo: ${window.regression.scenarios.length - failures} OK, ${failures} chyb.`;
        } finally {
            controls.forEach(node => { node.disabled = false; });
        }
    };
    window.playground.ready = reset();
    window.playground.ready.catch(report);
})();
