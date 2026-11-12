const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'jira-workspace-timer.user.js'), 'utf8');
const metadata = source.split('// ==/UserScript==')[0];
const AUTO_SETTINGS_KEY = 'jira-direct-timer-auto-settings-v1';
const AUTO_QUEUE_KEY = 'jira-direct-timer-auto-queue-v1';
const FAVORITES_KEY = 'jira-direct-timer-favorites-v1';
const currentUser = {key: 'demo-user', name: 'demo', displayName: 'Demo User'};
const ownLog = timeSpentSeconds => ({timeSpentSeconds, author: currentUser});
for (const directive of ['updateURL', 'downloadURL']) {
    assert.equal(metadata.match(new RegExp(`^// @${directive}\\s+(\\S+)\\s*$`, 'm'))?.[1],
        'https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-timer.user.js');
}

function setup(initial, failureAt = 0, input = '30', existing = false, latency = 0, extra = {}) {
    let state = initial;
    let autoSettings = extra.autoSettings || null;
    let autoQueue = extra.autoQueue || [];
    let favorites = extra.favorites === undefined ? null : typeof extra.favorites === 'string' ? extra.favorites : JSON.stringify(extra.favorites);
    const pickerQueries = [];
    let onPicker = query => ({sections: [{id: 'cs', issues: [
        {key: 'OPS-140', summaryText: 'Review pristupu', summary: 'Review <b>pristupu</b>'},
        {key: 'DEMO-102', summaryText: 'Code review'}]}]});
    let confirmations = 0;
    const posts = [];
    const persisted = [];
    const nodes = {};
    let panel;
    let now = 200000000;
    let render;
    let interval;
    let onFetch = () => {};
    let onTotals = () => ({fields: {subtasks: []}});
    let onIdentity = () => currentUser;
    const location = {pathname: '/browse/DEMO-101', search: '', origin: 'https://jira.alza.cz',
        get href() { return `${this.origin}${this.pathname}${this.search}`; }};
    function element() {
        return {dataset: {}, value: '', children: [], attributes: {},
            checked: false, disabled: false, hidden: false,
            get innerHTML() { return this.html; },
            set innerHTML(html) {
                this.html = html;
                for (const [, attribute, text] of html.matchAll(/<button\s+(data-[a-z-]+)(?:\s+[^>]*)?>([^<]*)<\/button>/g)) {
                    this.querySelector(`[${attribute}]`).textContent = text;
                }
            },
            querySelector: s => nodes[s] ||= element(),
            appendChild(child) { this.children.push(child); child.parent = this; },
            replaceChildren(...items) { this.children = []; items.forEach(child => this.appendChild(child)); },
            setAttribute(name, value) { this.attributes[name] = value; },
            focus() {},
            remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
            after(child) { if ('cancel' in child.dataset) nodes['[data-cancel]'] = child; }};
    }
    const window = {addEventListener() {}};
    window.top = window;
    class Clock extends Date { static now() { return now; } }
    let id = 0;
    let active = 0;
    let onCreatedIssue = key => ({key});
    class MockXhr {
        constructor() { this.listeners = {}; this.responseType = ''; this.status = 0; this.responseText = ''; }
        open(method, url) { this.method = method; this.url = url; }
        addEventListener(type, callback) { this.listeners[type] = callback; }
        send() {
            active++;
            Promise.resolve().then(() => onCreatedIssue('DEMO-105')).then(body => {
                this.status = extra.createStatus || 201;
                this.responseText = JSON.stringify(body);
                this.response = body;
                this.listeners.load?.();
            }).finally(() => { active--; });
        }
    }
    const mockFetch = async (path, options = {}) => {
        await Promise.resolve();
        const url = new URL(path, location.href);
        if ((/\/rest\/api\/(?:2|latest)\/issue\/?$/.test(url.pathname) ||
            /\/secure\/(?:QuickCreateIssue|Create(?:SubTask)?IssueDetails)(?:!init)?\.jspa$/.test(url.pathname)) && options.method === 'POST') {
            active++;
            try {
                const body = await onCreatedIssue('DEMO-104');
                return {ok: (extra.createStatus || 201) < 400, clone: () => ({json: async () => body})};
            } finally {
                active--;
            }
        }
        if (path.startsWith('/rest/api/2/issue/picker?')) {
            const query = new URLSearchParams(path.split('?')[1]).get('query');
            pickerQueries.push(query);
            return {ok: true, json: async () => onPicker(query)};
        }
        if (path === '/rest/api/2/myself') return {ok: true, json: async () => onIdentity()};
        const match = /^\/rest\/api\/2\/issue\/(DEMO-10[1-9])(\?fields=summary|\?fields=subtasks|\/worklog\?.+)$/.exec(path);
        if (match && match[2] === '?fields=summary') {
            return {ok: true, json: async () => ({fields: {summary: 'Other issue full title'}})};
        }
        if (match && match[2] === '?fields=subtasks') {
            return {ok: true, json: async () => onTotals(path)};
        }
        await Promise.resolve();
        const override = await onFetch(path, options);
        if (override !== undefined) return {ok: true, json: async () => override};
        now += latency;
        if (options.method === 'POST') {
            const body = JSON.parse(options.body);
            posts.push({path, body});
            if (posts.length === failureAt && extra.failureMode !== 'after') throw new Error('Network failure');
            persisted.push({path, body});
            if (posts.length === failureAt) throw new Error('Response lost after save');
            return {ok: true, json: async () => ({id: `log-${posts.length}`, timeSpentSeconds: body.timeSpentSeconds})};
        }
        const worklogs = existing ?
            [{id: 'existing', ...ownLog(120), comment: `[jira-direct-timer:${autoQueue[0]?.id || state?.manualEntry?.id || state?.id}]`}] :
            persisted.map((post, index) => ({id: `log-${index + 1}`, ...ownLog(post.body.timeSpentSeconds), comment: post.body.comment}));
        return {ok: true, json: async () => ({total: worklogs.length, worklogs})};
    };
    window.fetch = mockFetch;
    window.XMLHttpRequest = MockXhr;
    const context = {
        window, document: {body: element(), createElement: tag => { const node = element(); if (tag === 'section') panel = node; return node; }, getElementById: () => null,
            querySelector: selector => selector === '#summary-val' ? {textContent: 'Full issue title <safe text>'} : {content: 'PMA-OLD'}},
        location, URLSearchParams, URL,
        localStorage: {
            getItem: key => key === 'jira-direct-timer-v1' ? state ? JSON.stringify(state) : null :
                key === AUTO_SETTINGS_KEY ? autoSettings ? JSON.stringify(autoSettings) : null :
                    key === AUTO_QUEUE_KEY ? autoQueue.length ? JSON.stringify(autoQueue) : null :
                        key === FAVORITES_KEY ? favorites : null,
            setItem: (key, value) => {
                if (key === 'jira-direct-timer-v1') state = JSON.parse(value);
                else if (key === AUTO_SETTINGS_KEY) autoSettings = JSON.parse(value);
                else if (key === AUTO_QUEUE_KEY) autoQueue = JSON.parse(value);
                else if (key === FAVORITES_KEY) favorites = value;
                else throw new Error(`Unexpected storage key: ${key}`);
            },
            removeItem: key => {
                if (key === 'jira-direct-timer-v1') state = null;
                else if (key === AUTO_SETTINGS_KEY) autoSettings = null;
                else if (key === AUTO_QUEUE_KEY) autoQueue = [];
                else throw new Error(`Unexpected storage key: ${key}`);
            }
        },
        Date: Clock, crypto: {randomUUID: () => `manual-${++id}`}, confirm: () => { confirmations++; return true; }, setInterval: (callback, ms) => { render = callback; interval = ms; },
        navigator: {locks: {request: async (k, o, f) => f({})}}, setTimeout, clearTimeout,
        fetch: mockFetch
    };
    vm.runInNewContext(source, context);
    nodes['[data-minutes]'].value = input;
    return {nodes, panel, posts, styles: context.document.body.children[0].textContent,
        state: () => state, confirmations: () => confirmations, click: name => nodes[`[data-${name}]`].onclick(),
        settings: () => autoSettings, autoQueue: () => autoQueue,
        favorites: () => favorites === null ? null : JSON.parse(favorites), pickerQueries,
        onPicker: callback => { onPicker = callback; },
        externalFavorites: value => { favorites = value === null ? null : JSON.stringify(value); render(); },
        configureAuto: (enabled, value = 10) => {
            nodes['[data-auto-open]'].onclick();
            nodes['[data-auto-enabled]'].checked = enabled;
            nodes['[data-auto-enabled]'].onchange();
            nodes['[data-auto-minutes]'].value = String(value);
            nodes['[data-auto-save]'].onclick();
        },
        createIssue: async (url = '/rest/api/2/issue') => {
            await window.fetch(url, {method: 'POST', body: '{}'});
            await new Promise(resolve => setImmediate(resolve));
            while (active) await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setTimeout(resolve, 10));
        },
        createIssueViaXhr: async (url = '/rest/api/2/issue', responseType = '') => {
            const xhr = new window.XMLHttpRequest();
            xhr.open('POST', url);
            xhr.responseType = responseType;
            xhr.send();
            while (active) await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setTimeout(resolve, 10));
        },
        onCreatedIssue: callback => { onCreatedIssue = callback; },
        toasts: () => panel.children.find(child => 'toasts' in child.dataset).children,
        advance: ms => { now += ms; }, render: () => render(), interval: () => interval,
        onFetch: callback => { onFetch = callback; },
        onTotals: callback => { onTotals = callback; },
        onIdentity: callback => { onIdentity = callback; },
        navigate: path => { location.pathname = path; render(); },
        search: value => { location.search = value; render(); },
        keydown: async (key = 'Enter') => {
            let prevented = false;
            await nodes['[data-minutes]'].onkeydown({key, preventDefault: () => { prevented = true; }});
            return prevented;
        }};
}
const running = () => ({id: 'old', issue: 'DEMO-102', started: 199875000, ended: null, phase: 'running'});
(async () => {
    const legacyPanel = setup(null);
    assert.match(legacyPanel.styles, /#timer-sidebar\s*\{\s*display:\s*none\s*!important\s*\}/,
        'hide the entire legacy Clockify module, including its heading, without reserving space');
    assert.equal(legacyPanel.panel.id, 'jira-direct-timer', 'keep our timer separate from the hidden module');
    const version = metadata.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
    assert.ok(version, 'publish a three-part userscript version');
    assert.equal(source.match(/const VERSION = '(\d+\.\d+\.\d+)';/)?.[1], version,
        'keep the displayed version synchronized with userscript update metadata');
    assert.match(legacyPanel.panel.innerHTML, /<span data-version-wrap><a data-version><\/a><\/span>/);
    assert.doesNotMatch(legacyPanel.panel.innerHTML, /data-release-notes|data-release-note/);
    assert.doesNotMatch(legacyPanel.styles, /data-release-notes|data-release-note/);
    assert.equal(legacyPanel.nodes['[data-version]'].textContent, `v${version}`,
        'display the installed userscript version, keeping the label in sync with metadata');
    assert.equal(legacyPanel.nodes['[data-version]'].attributes.href,
        'https://github.com/bunnydad02/jira-direct-timer', 'link the version to the GitHub repository');
    assert.equal(legacyPanel.nodes['[data-version]'].attributes.target, '_blank');
    assert.equal(legacyPanel.nodes['[data-version]'].attributes.rel, 'noopener noreferrer');
    assert.equal(legacyPanel.nodes['[data-version]'].attributes['aria-label'],
        `Timer version ${version}; open GitHub repository`);
    assert.match(legacyPanel.styles, /\[data-header\] \{display:flex;align-items:center;gap:6px;margin-bottom:10px\}/);
    assert.match(legacyPanel.styles, /\[data-version-wrap\] \{margin-left:auto;font-size:9px/,
        'keep the version in the header row so the favorites section can sit above it');
    assert.equal(legacyPanel.nodes['[data-release-notes]'], undefined,
        'do not render release notes next to the GitHub version link');
    const autoOff = setup(null);
    assert.equal(autoOff.nodes['[data-auto-open]'].dataset.state, 'off', 'show disabled AUTO by default');
    assert.equal(autoOff.nodes['[data-auto-open]'].textContent, 'auto');
    assert.match(autoOff.nodes['[data-auto-open]'].attributes['aria-label'], /^AUTO vypnuto\./);
    autoOff.click('auto-open');
    assert.equal(autoOff.nodes['[data-auto-enabled]'].checked, false);
    assert.equal(autoOff.nodes['[data-auto-minutes]'].disabled, true,
        'keep the minutes field disabled unless automatic reporting is enabled');
    autoOff.nodes['[data-auto-enabled]'].checked = true;
    autoOff.nodes['[data-auto-enabled]'].onchange();
    autoOff.nodes['[data-auto-minutes]'].value = '25';
    autoOff.click('auto-close');
    assert.equal(autoOff.settings(), null, 'closing settings must discard unsaved changes');
    assert.equal(autoOff.nodes['[data-auto-open]'].dataset.state, 'off', 'unsaved changes must not change the indicator');
    await autoOff.createIssue();
    assert.equal(autoOff.posts.length, 0, 'new issues must not create worklogs by default');
    assert.equal(autoOff.state(), null);
    const configuredAuto = setup(null);
    configuredAuto.configureAuto(true, 10);
    assert.deepEqual(configuredAuto.settings(), {enabled: true, minutes: 10});
    assert.equal(configuredAuto.nodes['[data-auto-open]'].dataset.state, 'on',
        'show enabled AUTO in the panel without opening settings');
    assert.equal(configuredAuto.nodes['[data-auto-open]'].textContent, 'auto', 'keep the compact label to preserve layout');
    assert.match(configuredAuto.nodes['[data-auto-open]'].attributes.title, /AUTO zapnuto: 10 min/);
    configuredAuto.configureAuto(false);
    assert.equal(configuredAuto.nodes['[data-auto-open]'].dataset.state, 'off');
    assert.equal(configuredAuto.nodes['[data-auto-open]'].attributes.title, 'AUTO vypnuto');
    assert.match(setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 25}})
        .nodes['[data-auto-open]'].attributes['aria-label'], /^AUTO zapnuto: 25 min/, 'show saved AUTO minutes after reload');
    const brokenAuto = setup(null, 0, '30', false, 0, {autoSettings: {enabled: 'yes', minutes: 10}});
    assert.equal(brokenAuto.nodes['[data-auto-open]'].dataset.state, 'error',
        'corrupted AUTO settings must not look like a normal disabled state');
    assert.equal(brokenAuto.nodes['[data-auto-open]'].textContent, 'auto !');
    brokenAuto.configureAuto(true, 15);
    assert.equal(brokenAuto.nodes['[data-auto-open]'].dataset.state, 'on', 'saving valid settings clears the error indicator');
    assert.equal(brokenAuto.nodes['[data-auto-open]'].textContent, 'auto');
    assert.match(brokenAuto.nodes['[data-auto-open]'].attributes.title, /AUTO zapnuto: 15 min/);
    const invalidAuto = setup(null);
    invalidAuto.click('auto-open');
    invalidAuto.nodes['[data-auto-enabled]'].checked = true;
    invalidAuto.nodes['[data-auto-enabled]'].onchange();
    invalidAuto.nodes['[data-auto-minutes]'].value = '1.5';
    invalidAuto.click('auto-save');
    assert.equal(invalidAuto.settings(), null);
    assert.match(invalidAuto.nodes['[data-auto-error]'].textContent, /kladny/);
    const activeTimer = running();
    const automatic = setup(activeTimer, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 10}});
    await automatic.createIssue();
    assert.equal(automatic.posts.length, 1, `a successful issue creation should create one automatic worklog: ${automatic.nodes['[data-error]'].textContent}; queue=${JSON.stringify(automatic.autoQueue())}`);
    assert.match(automatic.posts[0].path, /DEMO-104\/worklog/);
    assert.equal(automatic.posts[0].body.timeSpentSeconds, 600);
    assert.equal(automatic.posts[0].body.started, new Date(200000000 - 600000).toISOString().replace('Z', '+0000'));
    assert.match(automatic.posts[0].body.comment, /Automaticky vykaz/);
    assert.match(automatic.posts[0].body.comment, /\[jira-direct-timer:auto-DEMO-104\]/);
    assert.deepEqual(automatic.state(), activeTimer, 'automatic reporting must preserve a running timer');
    assert.equal(automatic.autoQueue().length, 0);
    const automaticXhr = setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 5}});
    await automaticXhr.createIssueViaXhr();
    assert.equal(automaticXhr.posts.length, 1, 'also observe Jira issue creation through XMLHttpRequest');
    assert.match(automaticXhr.posts[0].path, /DEMO-105\/worklog/);
    assert.equal(automaticXhr.posts[0].body.timeSpentSeconds, 300);
    for (const via of ['createIssue', 'createIssueViaXhr']) {
        for (const endpoint of ['/secure/QuickCreateIssue.jspa?decorator=none',
            '/secure/CreateSubTaskIssueDetails.jspa?decorator=none',
            'https://jira.alza.cz/secure/CreateIssueDetails.jspa']) {
            const form = setup(activeTimer, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 11}});
            form.onCreatedIssue(key => ({issueKey: key, issueId: '104', issueUrl: `/browse/${key}`}));
            await form[via](endpoint, 'json');
            assert.equal(form.posts.length, 1, `${via}: observe successful Jira creation forms`);
            const key = via === 'createIssue' ? 'DEMO-104' : 'DEMO-105';
            assert.equal(form.posts[0].path, `/rest/api/2/issue/${key}/worklog?adjustEstimate=leave`);
            assert.equal(form.posts[0].body.timeSpentSeconds, 660);
            assert.equal(form.posts[0].body.started, new Date(200000000 - 660000).toISOString().replace('Z', '+0000'));
            assert.deepEqual(form.state(), activeTimer);
            await form[via](endpoint);
            assert.equal(form.posts.length, 1, 'duplicate creation notifications must not duplicate worklogs');
        }
        for (const endpoint of ['https://evil.example/secure/QuickCreateIssue.jspa',
            'https://evil.example/secure/CreateSubTaskIssueDetails.jspa',
            '/secure/QuickCreateIssue!init.jspa',
            '/secure/CreateSubTaskIssueDetails!init.jspa']) {
            const ignored = setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 11}});
            ignored.onCreatedIssue(key => ({issueKey: key}));
            await ignored[via](endpoint);
            assert.equal(ignored.posts.length, 0, 'ignore foreign origins and form initialization');
            assert.equal(ignored.autoQueue().length, 0);
        }
        for (const body of [{errors: {summary: 'Required'}}, {issueKey: 'invalid'}]) {
            const invalid = setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 11}});
            invalid.onCreatedIssue(() => body);
            await invalid[via]('/secure/QuickCreateIssue.jspa');
            assert.equal(invalid.posts.length, 0, 'validation failures or invalid keys must not create worklogs');
            assert.equal(invalid.autoQueue().length, 0);
            assert.match(invalid.nodes['[data-error]'].textContent, /nevratila jeji klic/);
        }
        const failed = setup(null, 0, '30', false, 0, {
            autoSettings: {enabled: true, minutes: 11}, createStatus: 400
        });
        await failed[via]('/secure/QuickCreateIssue.jspa');
        assert.equal(failed.posts.length, 0, 'failed creation HTTP responses must not create worklogs');
        const recovery = setup(activeTimer, 1, '30', false, 0, {
            autoSettings: {enabled: true, minutes: 11}, failureMode: 'after'
        });
        recovery.onCreatedIssue(key => ({issueKey: key}));
        await recovery[via]('/secure/QuickCreateIssue.jspa');
        assert.equal(recovery.autoQueue()[0].phase, 'pending');
        assert.match(recovery.nodes['[data-error]'].textContent, /Response lost/);
        await recovery.click('auto-retry');
        assert.equal(recovery.posts.length, 1);
        assert.equal(recovery.autoQueue().length, 0);
        assert.deepEqual(recovery.state(), activeTimer);
    }
    const unrecognizedCreatedIssue = setup(null, 0, '30', false, 0, {
        autoSettings: {enabled: true, minutes: 10}
    });
    unrecognizedCreatedIssue.onCreatedIssue(() => ({}));
    await unrecognizedCreatedIssue.createIssue();
    assert.equal(unrecognizedCreatedIssue.posts.length, 0);
    assert.match(unrecognizedCreatedIssue.nodes['[data-error]'].textContent, /nevratila jeji klic/);
    const uncertainAuto = setup(null, 1, '30', false, 0, {
        autoSettings: {enabled: true, minutes: 10}, failureMode: 'after'
    });
    await uncertainAuto.createIssue();
    assert.equal(uncertainAuto.posts.length, 1);
    assert.equal(uncertainAuto.autoQueue()[0].phase, 'pending');
    await uncertainAuto.click('auto-open');
    assert.equal(uncertainAuto.nodes['[data-auto-retry]'].hidden, false);
    await uncertainAuto.click('auto-retry');
    assert.equal(uncertainAuto.posts.length, 1, 'recovery must find the marker instead of repeating an uncertain POST');
    assert.equal(uncertainAuto.autoQueue().length, 0);
    const missingMarkerAuto = setup(null, 1, '30', false, 0, {
        autoSettings: {enabled: true, minutes: 10}
    });
    await missingMarkerAuto.createIssue();
    await missingMarkerAuto.click('auto-open');
    await missingMarkerAuto.click('auto-retry');
    assert.equal(missingMarkerAuto.posts.length, 1, 'a pending automatic POST without a marker must not be repeated');
    assert.equal(missingMarkerAuto.autoQueue()[0].phase, 'pending');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(legacyPanel.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h');
    assert.equal(legacyPanel.nodes['[data-worklog-total]'].hidden, false);
    for (const [seconds, expected] of [[7200, 'Dosud vykaz\u00e1no: 2h'], [1440, 'Dosud vykaz\u00e1no: 0,4h'], [439200, 'Dosud vykaz\u00e1no: 122h']]) {
        const formatted = setup(null);
        formatted.onFetch(() => ({total: 1, worklogs: [ownLog(seconds)]}));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(formatted.nodes['[data-worklog-total]'].textContent, expected);
    }
    const pagedTotal = setup(null);
    pagedTotal.onFetch(path => {
        const offset = Number(new URLSearchParams(path.split('?')[1]).get('startAt'));
        if (offset === 0) return {total: 3, worklogs: [
            ownLog(3600), ownLog(1800)
        ]};
        return {total: 3, worklogs: [ownLog(3661)]};
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pagedTotal.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 2,5h',
        'sum all worklogs across Jira pages');
    const colleague = {key: 'colleague', name: 'other', displayName: currentUser.displayName};
    const personal = setup(null);
    const personalQueries = [];
    personal.onFetch(path => {
        personalQueries.push(path);
        const offset = Number(new URLSearchParams(path.split('?')[1]).get('startAt'));
        const ownSeconds = path.includes('/DEMO-102/') ? 1800 : 900;
        return offset === 0 ?
            {total: 2, worklogs: [{timeSpentSeconds: 4500, author: colleague, updateAuthor: currentUser}]} :
            {total: 2, worklogs: [{...ownLog(ownSeconds), updateAuthor: colleague}]};
    });
    personal.onTotals(() => ({fields: {subtasks: [{key: 'DEMO-102'}]}}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(personal.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0,3h (0,8h)',
        'count only the signed-in author on every page of the issue and its subtasks, never updateAuthor or displayName');
    assert.ok(personalQueries.some(path => path.includes('/DEMO-102/') && path.includes('startAt=1')));
    assert.equal(personal.posts.length, 0);
    for (const [user, author] of [
        [{key: 'stable', name: 'renamed'}, {key: 'stable', name: 'old-name'}],
        [{accountId: 'cloud-id'}, {accountId: 'cloud-id'}],
        [{name: 'server-user'}, {name: 'server-user'}]
    ]) {
        const identity = setup(null);
        identity.onIdentity(() => user);
        identity.onFetch(() => ({total: 1, worklogs: [{timeSpentSeconds: 3600, author}]}));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(identity.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 1h');
    }
    for (const [user, author, message] of [
        [{displayName: 'Demo User'}, currentUser, /prihlaseneho/],
        [currentUser, undefined, /autora/],
        [currentUser, {displayName: currentUser.displayName}, /autora/],
        [{key: 'demo-user'}, {name: 'demo'}, /autora/]
    ]) {
        const invalid = setup(null);
        invalid.onIdentity(() => user);
        invalid.onFetch(() => ({total: 1, worklogs: [{timeSpentSeconds: 3600, author}]}));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(invalid.nodes['[data-worklog-total]'].dataset.state, 'error');
        assert.match(invalid.nodes['[data-worklog-total]'].textContent, message);
        assert.equal(invalid.posts.length, 0);
    }
    const identityFailure = setup(null);
    identityFailure.onIdentity(() => { throw new Error('Identity offline'); });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(identityFailure.nodes['[data-worklog-total]'].textContent, /Identity offline/);
    identityFailure.onIdentity(() => currentUser);
    identityFailure.navigate('/browse/DEMO-102');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(identityFailure.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h',
        'identity lookup is retried when totals are refreshed');
    for (const broken of [
        {total: 2, worklogs: []},
        {total: 1, worklogs: [{...ownLog(-1)}]},
        {total: 2, worklogs: [ownLog(Number.MAX_SAFE_INTEGER), ownLog(1)]}
    ]) {
        const invalid = setup(null);
        invalid.onFetch(() => broken);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(invalid.nodes['[data-worklog-total]'].dataset.state, 'error');
    }
    const overflow = setup(null);
    overflow.onFetch(() => ({total: 1, worklogs: [ownLog(Number.MAX_SAFE_INTEGER)]}));
    overflow.onTotals(() => ({fields: {subtasks: [{key: 'DEMO-102'}]}}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(overflow.nodes['[data-worklog-total]'].dataset.state, 'error');
    for (const [own, child, expected] of [
        [7200, 3600, 'Dosud vykaz\u00e1no: 2h (3h)'],
        [7200, 0, 'Dosud vykaz\u00e1no: 2h'],
        [0, 3600, 'Dosud vykaz\u00e1no: 0h (1h)'],
        [0, 0, 'Dosud vykaz\u00e1no: 0h'],
        [7200, 60, 'Dosud vykaz\u00e1no: 2h (2h)']
    ]) {
        const total = setup(null);
        total.onFetch(path => ({total: 1, worklogs: [ownLog(path.includes('/DEMO-102/') ? child : own)]}));
        total.onTotals(() => ({fields: {subtasks: [{key: 'DEMO-102'}]}}));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(total.nodes['[data-worklog-total]'].textContent, expected,
            'compare exact seconds before rounding; do not double-count the parent');
        assert.equal(total.posts.length, 0, 'loading subtask totals must be read-only');
    }
    for (const fields of [
        {}, {subtasks: null}, {subtasks: [{}]}, {subtasks: [null]},
        {subtasks: [{key: 'DEMO-101'}]}, {subtasks: [{key: 'invalid'}]},
        {subtasks: [{key: 'DEMO-102'}, {key: 'DEMO-102'}]}
    ]) {
        const invalid = setup(null);
        invalid.onTotals(() => ({fields}));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(invalid.nodes['[data-worklog-total]'].dataset.state, 'error');
        assert.match(invalid.nodes['[data-worklog-total]'].textContent, /subtasku/);
    }
    const failedAggregate = setup(null);
    failedAggregate.onTotals(() => { throw new Error('Aggregate offline'); });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(failedAggregate.nodes['[data-worklog-total]'].textContent, /Aggregate offline/);
    const issueQueries = [];
    pagedTotal.onFetch(path => {
        if (path.includes('/worklog?startAt=')) issueQueries.push(path);
        return {total: 1, worklogs: [ownLog(60)]};
    });
    pagedTotal.navigate('/browse/DEMO-102');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pagedTotal.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h');
    assert.ok(issueQueries.some(path => path.includes('/DEMO-102/')), 'load a fresh total when the open issue changes');
    const queryCount = issueQueries.length;
    pagedTotal.navigate('/browse/DEMO-101');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pagedTotal.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h');
    assert.ok(issueQueries.length > queryCount, 'refresh the total when reopening a previously viewed issue');
    const failedTotal = setup(null);
    failedTotal.onFetch(() => { throw new Error('Jira offline'); });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(failedTotal.nodes['[data-worklog-total]'].textContent, /Jira offline/,
        'show worklog fetch failures instead of hiding them');
    for (const [initial, action] of [
        [running(), 'stop'], [running(), 'start'], [running(), 'manual'],
        [null, 'manual'], [{...running(), ended: 200000000, phase: 'stopped'}, 'manual']
    ]) {
        const stable = setup(initial);
        assert.equal(stable.nodes['[data-version]'].textContent, `v${version}`);
        const before = {
            running: stable.panel.dataset.running,
            other: stable.panel.dataset.other,
            saveHidden: stable.nodes['[data-save-row]'].hidden,
            cancelHidden: stable.nodes['[data-cancel]'].hidden,
            status: stable.nodes['[data-status]'].textContent
        };
        let requests = 0;
        stable.onFetch(() => {
            requests++;
            stable.advance(500);
            stable.render();
            assert.deepEqual({
                running: stable.panel.dataset.running,
                other: stable.panel.dataset.other,
                saveHidden: stable.nodes['[data-save-row]'].hidden,
                cancelHidden: stable.nodes['[data-cancel]'].hidden,
                status: stable.nodes['[data-status]'].textContent
            }, before, `${action}: intermediate storage phases must not change panel layout or status`);
            assert.equal(stable.nodes['[data-start]'].disabled, true);
            assert.equal(stable.nodes['[data-stop]'].disabled, true);
            assert.equal(stable.nodes['[data-manual]'].disabled, true);
            if (initial?.phase === 'running') {
                assert.equal(stable.nodes['[data-clock]'].textContent, `00:02:${String(5 + Math.floor(requests / 2)).padStart(2, '0')}`);
            }
        });
        await stable.click(action);
        assert.ok(requests >= 2);
        assert.equal(stable.nodes['[data-error]'].textContent, '');
        assert.equal(stable.nodes['[data-save-row]'].hidden, true);
        assert.ok(stable.toasts().length >= 1);
    }
    for (const initial of [null, running(), {...running(), issue: 'DEMO-101'}]) {
        const h = setup(initial);
        assert.match(h.panel.innerHTML, /^<div data-favorites hidden>.*<div data-header><strong>Jira stopky<\/strong>/);
        await h.click('manual');
        assert.equal(h.confirmations(), 0, 'manual entry must save without a dialog');
        assert.equal(h.posts.length, 1);
        const last = h.posts.at(-1);
        assert.match(last.path, /DEMO-101/);
        assert.equal(last.body.timeSpentSeconds, 1800);
        assert.equal(last.body.started, new Date(200000000 - 1800000).toISOString().replace('Z', '+0000'));
        assert.match(last.body.comment, /Rucni vykaz/);
        assert.equal(h.nodes['[data-minutes]'].value, '');
        assert.equal(h.toasts().length, 1);
        assert.equal(h.toasts()[0].children[0].textContent, 'Zaznamenáno');
        assert.equal(h.toasts()[0].children[1].attributes['aria-label'], '00:30:00 do tasku DEMO-101');
        assert.equal(h.toasts()[0].children[1].children[0].textContent, '00:30:00');
        assert.equal(h.toasts()[0].children[1].children[1].textContent, 'DEMO-101');
        assert.equal(h.toasts()[0].children[1].href, 'https://jira.alza.cz/browse/DEMO-101');
        assert.equal(h.toasts()[0].children[2].textContent, 'Full issue title <safe text>');
        assert.equal(h.toasts()[0].children[2].href, 'https://jira.alza.cz/browse/DEMO-101');
        if (initial) {
            assert.deepEqual(h.state(), initial, 'manual entry must preserve the exact running timer');
            assert.equal(h.panel.dataset.running, 'true');
            assert.equal(h.nodes['[data-clock]'].textContent, '00:02:05');
            h.advance(5000);
            h.render();
            assert.equal(h.toasts().length, 0);
            assert.equal(h.nodes['[data-clock]'].textContent, '00:02:10');
        } else {
            assert.equal(h.state().phase, 'saved');
            assert.equal(h.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
        }
    }
    for (const input of ['', '0', '-1', '1.5', 'NaN', '9999999999999999999']) {
        const h = setup(running(), 0, input);
        await h.click('manual');
        assert.equal(h.posts.length, 0);
        assert.equal(h.toasts().length, 0);
        assert.equal(h.state().phase, 'running');
        assert.match(h.nodes['[data-error]'].textContent, /kladny/);
    }
    const h = setup(running(), 1);
    await h.click('manual');
    assert.equal(h.state().phase, 'running');
    assert.equal(h.state().manualEntry.phase, 'pending');
    assert.equal(h.toasts().length, 0, 'uncertain writes must not show success');
    assert.equal(h.state().manualEntry.issue, 'DEMO-101');
    assert.equal(h.state().started, running().started);
    assert.equal(h.nodes['[data-save-row]'].hidden, false);
    assert.equal(h.nodes['[data-manual]'].disabled, true);
    assert.equal(h.nodes['[data-stop]'].disabled, true);
    assert.equal(h.nodes['[data-start]'].disabled, true);
    assert.equal(h.nodes['[data-cancel]'].disabled, true);
    const unresolved = h.state();
    for (const action of ['stop', 'cancel', 'start']) {
        await h.click(action);
        assert.deepEqual(h.state(), unresolved, `${action} must not overwrite an unresolved manual entry`);
    }
    h.advance(3000);
    h.render();
    assert.equal(h.nodes['[data-clock]'].textContent, '00:02:08');
    const uncertain = h.state();
    await h.click('save');
    assert.equal(h.posts.length, 1, 'uncertain writes must not be repeated');
    assert.match(h.nodes['[data-error]'].textContent, /neopakuji/);
    const reloaded = setup(uncertain, 0, '20', true);
    await reloaded.click('save');
    assert.equal(reloaded.posts.length, 0, 'recovery must find the manual marker, not the timer marker');
    assert.deepEqual(reloaded.state(), running());
    assert.equal(reloaded.nodes['[data-stop]'].disabled, false);
    assert.equal(reloaded.nodes['[data-manual]'].disabled, false);
    assert.equal(reloaded.nodes['[data-save-row]'].hidden, true);
    assert.equal(reloaded.toasts()[0].children[1].attributes['aria-label'], '00:02:00 do tasku DEMO-101');
    const completedManual = setup({...running(), manualEntry: {...uncertain.manualEntry, phase: 'saved'}});
    await completedManual.click('save');
    assert.equal(completedManual.posts.length, 0);
    assert.equal(completedManual.toasts().length, 0, 'already completed entries must not replay a toast');
    assert.deepEqual(completedManual.state(), running());
    const secondFailure = setup({...running(), ended: 200000000, phase: 'stopped'}, 2);
    await secondFailure.click('manual');
    assert.equal(secondFailure.state().phase, 'pending');
    assert.equal(secondFailure.state().issue, 'DEMO-101');
    assert.equal(secondFailure.posts.length, 2);
    assert.equal(secondFailure.toasts().length, 1, 'only the successful first save should be confirmed');
    const old = running();
    old.phase = 'saved';
    old.ended = 200000000;
    old.manualNext = {id: 'queued', issue: 'DEMO-101', started: 198200000, ended: 200000000, phase: 'stopped', manual: true};
    const recovery = setup(old);
    assert.equal(recovery.nodes['[data-start]'].disabled, true);
    await recovery.click('save');
    assert.equal(recovery.posts.length, 1);
    assert.equal(recovery.state().issue, 'DEMO-101');
    assert.equal(recovery.state().phase, 'saved');
    assert.equal(recovery.state().worklogId, 'log-1');
    assert.equal(recovery.state().recordedSeconds, 1800);
    assert.equal(recovery.state().completedAt, 200000000);
    const pending = running();
    pending.phase = 'pending';
    pending.ended = 200000000;
    pending.manualNext = old.manualNext;
    const verified = setup(pending, 0, '30', true);
    await verified.click('save');
    assert.equal(verified.posts.length, 0, 'existing markers must not create duplicates');
    assert.equal(verified.state().issue, 'DEMO-101');
    assert.equal(verified.state().phase, 'saved');
    assert.equal(verified.state().worklogId, 'existing');
    assert.equal(verified.state().recordedSeconds, 120);
    assert.equal(verified.state().completedAt, 200000000);
    assert.equal(verified.toasts().length, 2, 'queued saves must each keep their own notification');
    const firstFailure = setup({...running(), ended: 200000000, phase: 'stopped'}, 1);
    await firstFailure.click('manual');
    assert.equal(firstFailure.posts.length, 1);
    assert.equal(firstFailure.state().phase, 'pending');
    assert.equal(firstFailure.state().manualNext.issue, 'DEMO-101');
    assert.equal(firstFailure.toasts().length, 0);
    const resumedManual = setup(firstFailure.state(), 0, '30', true);
    await resumedManual.click('save');
    assert.equal(resumedManual.posts.length, 0);
    assert.equal(resumedManual.state().phase, 'saved');
    assert.equal(resumedManual.state().issue, 'DEMO-101');
    assert.equal(resumedManual.toasts().length, 2);
    const failedSwitch = setup(running(), 1);
    await failedSwitch.click('start');
    assert.equal(failedSwitch.state().phase, 'pending');
    assert.equal(failedSwitch.state().nextIssue, 'DEMO-101');
    assert.equal(failedSwitch.toasts().length, 0);
    await failedSwitch.click('save');
    assert.equal(failedSwitch.posts.length, 1, 'an uncertain switch must not repeat the POST');
    assert.equal(failedSwitch.state().nextIssue, 'DEMO-101');
    const resumedSwitch = setup(failedSwitch.state(), 0, '30', true);
    await resumedSwitch.click('save');
    assert.equal(resumedSwitch.posts.length, 0);
    assert.equal(resumedSwitch.state().phase, 'running');
    assert.equal(resumedSwitch.state().issue, 'DEMO-101');
    assert.equal(resumedSwitch.state().started, 200000000);
    assert.equal(resumedSwitch.toasts().length, 1);
    assert.equal(resumedSwitch.toasts()[0].children[1].children[0].textContent, '00:02:00');
    const switching = setup(running());
    assert.equal(switching.panel.dataset.other, 'true');
    assert.equal(switching.panel.dataset.running, 'true');
    assert.equal(switching.nodes['[data-issue]'].href, 'https://jira.alza.cz/browse/DEMO-102');
    assert.equal(switching.nodes['[data-title]'].href, 'https://jira.alza.cz/browse/DEMO-102');
    assert.equal(switching.nodes['[data-measuring]'].textContent, 'Nyní se měří: DEMO-102');
    assert.equal(switching.nodes['[data-measuring]'].hidden, false);
    assert.equal(switching.nodes['[data-stop]'].textContent, 'STOP');
    assert.equal(switching.nodes['[data-start]'].textContent, 'START');
    await switching.click('start');
    assert.equal(switching.posts.length, 1);
    assert.equal(switching.state().phase, 'running');
    assert.equal(switching.state().issue, 'DEMO-101');
    assert.equal(switching.toasts()[0].children[1].attributes['aria-label'], '00:02:00 do tasku DEMO-102');
    assert.equal(switching.toasts()[0].children[2].textContent, 'Other issue full title');
    assert.equal(switching.panel.dataset.other, 'false');
    assert.equal(switching.nodes['[data-issue]'].href, 'https://jira.alza.cz/browse/DEMO-101');
    assert.equal(switching.nodes['[data-measuring]'].hidden, true);
    assert.equal(switching.state().title, 'Full issue title <safe text>');
    assert.match(switching.nodes['[data-title]'].textContent, /Full issue title <safe text>/);
    assert.ok(!switching.nodes['[data-status]'].textContent.includes('Bezi'));
    const short = running();
    short.started = 199991000;
    const minimum = setup(short);
    await minimum.click('start');
    assert.equal(minimum.posts[0].body.timeSpentSeconds, 60);
    const fresh = setup(null);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fresh.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h');
    assert.equal(fresh.panel.dataset.running, 'false');
    assert.equal(fresh.panel.dataset.other, 'false');
    assert.equal(fresh.nodes['[data-issue]'].hidden, true);
    await fresh.click('start');
    assert.equal(fresh.state().phase, 'running');
    assert.equal(fresh.interval(), 100, 'display should update within 100 ms of second boundaries');
    assert.equal(fresh.nodes['[data-clock]'].textContent, '00:00:00');
    for (let second = 0; second < 4; second++) {
        fresh.advance(999);
        fresh.render();
        assert.equal(fresh.nodes['[data-clock]'].textContent, `00:00:0${second}`);
        fresh.advance(1);
        fresh.render();
        assert.equal(fresh.nodes['[data-clock]'].textContent, `00:00:0${second + 1}`);
    }
    assert.equal(fresh.confirmations(), 0);
    await fresh.click('stop');
    assert.equal(fresh.posts.length, 1);
    assert.equal(fresh.posts[0].body.timeSpentSeconds, 60);
    assert.equal(fresh.state().phase, 'saved');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fresh.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h',
        'refresh the displayed total after saving a worklog');
    assert.equal(fresh.state().completedAt, 200004000);
    assert.equal(fresh.confirmations(), 0);
    assert.equal(fresh.nodes['[data-save-row]'].hidden, true);
    assert.equal(fresh.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    assert.equal(fresh.nodes['[data-issue]'].hidden, true);
    assert.equal(fresh.nodes['[data-clock]'].textContent, '00:00:00');
    assert.equal(fresh.toasts().length, 1);
    assert.equal(fresh.toasts()[0].children[1].attributes['aria-label'], '00:01:00 do tasku DEMO-101');
    assert.equal(fresh.toasts()[0].children[1].children[0].textContent, '00:01:00');
    fresh.advance(4999);
    fresh.render();
    assert.equal(fresh.toasts().length, 1);
    assert.equal(fresh.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    fresh.advance(1);
    fresh.render();
    assert.equal(fresh.toasts().length, 0);
    assert.equal(fresh.nodes['[data-issue]'].hidden, true);
    assert.equal(fresh.nodes['[data-title]'].textContent, '');
    assert.equal(fresh.nodes['[data-clock]'].textContent, '00:00:00');
    assert.equal(fresh.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    assert.equal(fresh.panel.dataset.running, 'false');
    assert.equal(fresh.state().phase, 'saved', 'keep saved marker for duplicate protection');
    const oldSaved = setup({...fresh.state(), completedAt: 200000000 - 6000});
    assert.equal(oldSaved.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    assert.equal(oldSaved.toasts().length, 0);
    const recentSaved = setup({...fresh.state(), completedAt: 200000000});
    assert.equal(recentSaved.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    assert.equal(recentSaved.toasts().length, 0, 'reload must not replay completed notifications');
    const stopFailure = setup(running(), 1);
    await stopFailure.click('stop');
    assert.equal(stopFailure.state().phase, 'pending');
    assert.equal(stopFailure.toasts().length, 0);
    assert.equal(stopFailure.nodes['[data-save-row]'].hidden, false);
    await stopFailure.click('save');
    assert.equal(stopFailure.posts.length, 1);
    assert.equal(stopFailure.confirmations(), 0);
    assert.equal(stopFailure.toasts().length, 0);
    const cancelOther = setup(running());
    assert.equal(cancelOther.nodes['[data-cancel]'].hidden, false);
    assert.equal(cancelOther.nodes['[data-cancel]'].textContent, 'CANCEL');
    await cancelOther.click('cancel');
    assert.equal(cancelOther.state(), null);
    assert.equal(cancelOther.posts.length, 0);
    assert.equal(cancelOther.confirmations(), 0);
    assert.equal(cancelOther.nodes['[data-cancel]'].hidden, true);
    assert.equal(cancelOther.nodes['[data-issue]'].hidden, true);
    assert.equal(cancelOther.toasts()[0].dataset.toast, 'discarded');
    assert.equal(cancelOther.toasts()[0].children[0].textContent, 'Zahozeno');
    assert.equal(cancelOther.toasts()[0].children[1].attributes['aria-label'], '00:02:05 z tasku DEMO-102');
    assert.equal(cancelOther.toasts()[0].children[1].children[0].textContent, '00:02:05');
    assert.equal(cancelOther.toasts()[0].children[1].children[1].textContent, 'DEMO-102');
    assert.equal(cancelOther.toasts()[0].children[2].textContent, 'Other issue full title');
    assert.equal(cancelOther.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    cancelOther.advance(5000);
    cancelOther.render();
    assert.equal(cancelOther.toasts().length, 0);
    const sameIssue = {...running(), issue: 'DEMO-101'};
    const cancelSame = setup(sameIssue);
    assert.equal(cancelSame.nodes['[data-cancel]'].textContent, 'CANCEL');
    await cancelSame.click('cancel');
    assert.equal(cancelSame.state(), null);
    const saved = {...running(), ended: 200000000, phase: 'saved', worklogId: 'untouched'};
    const cancelSaved = setup(saved);
    assert.equal(cancelSaved.nodes['[data-cancel]'].hidden, true);
    await cancelSaved.click('cancel');
    assert.equal(cancelSaved.state().worklogId, 'untouched');
    assert.equal(cancelSaved.posts.length, 0);
    assert.equal(cancelSaved.toasts().length, 0);
    const cancelPending = setup({...running(), ended: 200000000, phase: 'pending'});
    assert.equal(cancelPending.nodes['[data-cancel]'].hidden, true);
    await cancelPending.click('cancel');
    assert.equal(cancelPending.state().phase, 'pending');
    assert.equal(cancelPending.toasts().length, 0);
    const titled = setup({...running(), title: 'Persisted full title'});
    assert.match(titled.nodes['[data-title]'].textContent, /Persisted full title/);
    const legacyTitle = setup(running());
    await new Promise(resolve => setImmediate(resolve));
    assert.match(legacyTitle.nodes['[data-title]'].textContent, /Other issue full title/);
    assert.equal(legacyTitle.posts.length, 0);
    for (const initial of [null, running()]) {
        const enter = setup(initial, 0, '20', false, 1500);
        assert.equal(await enter.keydown('Escape'), false);
        assert.equal(enter.posts.length, 0);
        assert.equal(await enter.keydown(), true);
        assert.equal(enter.posts.length, 1);
        assert.equal(enter.posts[0].body.timeSpentSeconds, 1200);
        assert.equal(enter.nodes['[data-minutes]'].value, '');
        if (initial) {
            assert.deepEqual(enter.state(), initial, 'slow API must not pause or restart the timer');
            assert.equal(enter.nodes['[data-clock]'].textContent, '00:02:09');
            await enter.click('stop');
            assert.match(enter.posts[1].path, /DEMO-102/);
            assert.equal(enter.posts[1].body.timeSpentSeconds, 120);
        }
        await enter.keydown();
        assert.equal(enter.posts.length, initial ? 2 : 1, 'empty Enter must not add another worklog');
        assert.match(enter.nodes['[data-error]'].textContent, /kladny/);
    }
    const blockedEnter = setup(uncertain);
    await blockedEnter.keydown();
    assert.equal(blockedEnter.posts.length, 0);
    const instantStop = setup(null);
    await instantStop.click('start');
    await instantStop.click('stop');
    assert.equal(instantStop.posts[0].body.timeSpentSeconds, 60);
    const rapid = setup(null);
    await rapid.click('start');
    rapid.advance(43000);
    await rapid.click('cancel');
    rapid.advance(1000);
    await rapid.click('start');
    await rapid.click('stop');
    assert.equal(rapid.toasts().length, 2);
    assert.equal(rapid.toasts()[0].children[1].attributes['aria-label'], '00:00:43 z tasku DEMO-101');
    assert.equal(rapid.toasts()[1].children[1].attributes['aria-label'], '00:01:00 do tasku DEMO-101');
    rapid.advance(4000);
    rapid.render();
    assert.equal(rapid.toasts().length, 1, 'each toast must expire independently');
    rapid.advance(1000);
    rapid.render();
    assert.equal(rapid.toasts().length, 0);
    assert.equal(rapid.panel.children.find(child => 'toasts' in child.dataset).attributes['aria-live'], 'polite');
    const linkedIssue = setup(null);
    linkedIssue.search('?selectedIssue=DEMO-102');
    assert.equal(linkedIssue.nodes['[data-target]'], undefined, 'the panel must not show a separate write-target label');
    await linkedIssue.click('manual');
    assert.match(linkedIssue.posts[0].path, /\/issue\/DEMO-101\/worklog/, 'selectedIssue must not redirect writes on an issue page');
    await linkedIssue.click('start');
    assert.equal(linkedIssue.state().issue, 'DEMO-101');
    const board = setup(null);
    board.navigate('/secure/RapidBoard.jspa');
    board.search('?rapidView=1&selectedIssue=DEMO-102');
    await board.click('manual');
    assert.match(board.posts[0].path, /\/issue\/DEMO-102\/worklog/, 'boards keep using the selected issue');
    const foreignMarker = id => (path, options) => options.method === 'POST' ? undefined :
        {total: 1, worklogs: [{id: 'foreign', timeSpentSeconds: 600, author: {key: 'other-user', name: 'other'}, comment: `[jira-direct-timer:${id}]`}]};
    const foreignAuto = setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 10}});
    foreignAuto.onFetch(foreignMarker('auto-DEMO-104'));
    await foreignAuto.createIssue();
    assert.equal(foreignAuto.posts.length, 1, "another user's marker must not suppress the automatic worklog");
    assert.equal(foreignAuto.autoQueue().length, 0);
    const foreignStopped = setup({id: 'stopped-1', issue: 'DEMO-101', started: 199000000, ended: 199600000, phase: 'stopped'});
    foreignStopped.onFetch(foreignMarker('stopped-1'));
    await foreignStopped.click('save');
    assert.equal(foreignStopped.posts.length, 1);
    assert.equal(foreignStopped.state().phase, 'saved');
    assert.equal(foreignStopped.state().worklogId, 'log-1', 'the saved worklog must be our own POST');
    const foreignPending = setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 10}, autoQueue: [
        {id: 'auto-DEMO-104', issue: 'DEMO-104', started: 199400000, ended: 200000000, phase: 'pending', automatic: true}]});
    foreignPending.onFetch(foreignMarker('auto-DEMO-104'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(foreignPending.posts.length, 0, 'an uncertain POST must not be confirmed by a foreign worklog');
    assert.equal(foreignPending.autoQueue()[0].phase, 'pending');
    assert.match(foreignPending.nodes['[data-error]'].textContent, /nebyl nalezen/);
    const unknownIdentity = setup({id: 'stopped-2', issue: 'DEMO-101', started: 199000000, ended: 199600000, phase: 'stopped'});
    unknownIdentity.onIdentity(() => ({displayName: 'Demo User'}));
    unknownIdentity.onFetch(foreignMarker('stopped-2'));
    await unknownIdentity.click('save');
    assert.equal(unknownIdentity.posts.length, 0, 'do not write when ownership of an existing marker cannot be verified');
    assert.equal(unknownIdentity.state().phase, 'stopped');
    assert.match(unknownIdentity.nodes['[data-error]'].textContent, /identitu prihlaseneho uzivatele/);
    for (const via of ['createIssue', 'createIssueViaXhr']) {
        const crossOrigin = setup(null, 0, '30', false, 0, {autoSettings: {enabled: true, minutes: 10}});
        await crossOrigin[via]('https://evil.example/rest/api/2/issue');
        assert.equal(crossOrigin.posts.length, 0, `${via}: ignore issue creation on another origin`);
        assert.equal(crossOrigin.autoQueue().length, 0);
        await crossOrigin[via]('https://jira.alza.cz/rest/api/2/issue');
        assert.equal(crossOrigin.posts.length, 1, `${via}: accept absolute same-origin issue creation`);
    }
    const favRows = h => h.nodes['[data-fav-list]'].children.filter(child => 'favIssue' in child.dataset);
    const favRow = (h, key) => favRows(h).find(row => row.dataset.favIssue === key);
    const favResultRows = h => h.nodes['[data-fav-results]'].children.filter(child => 'favIssue' in child.dataset);
    const typeSearch = async (h, value) => {
        h.nodes['[data-fav-search]'].value = value;
        h.nodes['[data-fav-search]'].oninput();
        await new Promise(resolve => setTimeout(resolve, 300));
        await new Promise(resolve => setImmediate(resolve));
    };
    const favorites = setup(null, 0, '30', false, 0, {favorites: [{issue: 'DEMO-102', title: 'Code review'}]});
    assert.equal(favorites.nodes['[data-fav-count]'].textContent, '1', 'the header chip shows how many favorites exist');
    assert.equal(favorites.nodes['[data-favorites]'].hidden, true);
    favorites.click('fav-open');
    assert.equal(favorites.nodes['[data-favorites]'].hidden, false);
    assert.equal(favorites.nodes['[data-fav-open]'].hidden, true, 'hide the chip while favorites are open');
    assert.equal(favRow(favorites, 'DEMO-102').children[0].attributes.target, '_blank');
    favorites.click('fav-add');
    assert.equal(favorites.nodes['[data-fav-search]'].hidden, false);
    await typeSearch(favorites, 'r');
    assert.equal(favorites.pickerQueries.length, 0, 'do not search Jira for a single character');
    await typeSearch(favorites, 'review');
    assert.deepEqual(favorites.pickerQueries, ['review']);
    const [opsResult, savedResult] = favResultRows(favorites);
    assert.equal(opsResult.children[0].href, 'https://jira.alza.cz/browse/OPS-140');
    assert.equal(opsResult.children[0].attributes.rel, 'noopener noreferrer');
    assert.equal(opsResult.children[0].children[1].textContent, 'Review pristupu');
    assert.ok('favSaved' in savedResult.children[1].dataset, 'already saved results are marked instead of offering +');
    assert.equal(favorites.favorites().length, 1, 'searching or opening a result never changes favorites');
    opsResult.children[1].onclick();
    assert.deepEqual(favorites.favorites(), [{issue: 'DEMO-102', title: 'Code review'}, {issue: 'OPS-140', title: 'Review pristupu'}]);
    assert.equal(favorites.nodes['[data-fav-search]'].value, '', 'adding clears the search field');
    assert.equal(favorites.nodes['[data-fav-search]'].hidden, true);
    assert.equal(favResultRows(favorites).length, 0, 'adding clears the results');
    assert.ok('fresh' in favRow(favorites, 'OPS-140').dataset, 'highlight the newly added favorite');
    favRow(favorites, 'OPS-140').children[3].onclick();
    assert.deepEqual(favorites.favorites(), [{issue: 'DEMO-102', title: 'Code review'}]);
    assert.equal(favorites.posts.length, 0);
    await favRow(favorites, 'DEMO-102').children[2].onclick();
    assert.equal(favorites.state().issue, 'DEMO-102', 'play starts the favorite even when another issue is open');
    assert.equal(favorites.state().phase, 'running');
    assert.equal(favorites.nodes['[data-favorites]'].hidden, true, 'a successful start collapses favorites');
    assert.equal(favorites.nodes['[data-fav-open]'].hidden, false);

    const stale = setup(null, 0, '30', false, 0, {favorites: []});
    const answers = {};
    stale.onPicker(query => new Promise(resolve => { answers[query] = resolve; }));
    stale.click('fav-open');
    stale.click('fav-add');
    await typeSearch(stale, 'old');
    await typeSearch(stale, 'new');
    answers.new({sections: [{issues: [{key: 'NEW-1', summaryText: 'New result'}]}]});
    await new Promise(resolve => setImmediate(resolve));
    answers.old({sections: [{issues: [{key: 'OLD-1', summaryText: 'Old result'}]}]});
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(favResultRows(stale).map(row => row.dataset.favIssue), ['NEW-1'], 'ignore stale search responses');
    stale.onPicker(() => { throw new Error('Picker offline'); });
    await typeSearch(stale, 'broken');
    assert.match(stale.nodes['[data-fav-error]'].textContent, /Hled\u00e1n\u00ed selhalo: .*Picker offline/);
    stale.onPicker(() => ({sections: 'invalid'}));
    await typeSearch(stale, 'invalid');
    assert.match(stale.nodes['[data-fav-error]'].textContent, /neocekavanou odpoved/);

    const favoriteSwitch = setup(running(), 0, '30', false, 0, {favorites: [{issue: 'DEMO-103', title: 'Third'}]});
    favoriteSwitch.click('fav-open');
    await favRow(favoriteSwitch, 'DEMO-103').children[2].onclick();
    assert.match(favoriteSwitch.posts[0].path, /DEMO-102\/worklog/, 'switching from a favorite saves the running issue first');
    assert.equal(favoriteSwitch.state().issue, 'DEMO-103');
    assert.equal(favoriteSwitch.state().started, 200000000, 'the favorite timer starts where the previous one ended');

    const runningFavorite = setup(running(), 0, '30', false, 0, {favorites: [{issue: 'DEMO-102', title: 'Second'}]});
    runningFavorite.click('fav-open');
    const runningPlay = favRow(runningFavorite, 'DEMO-102').children[2];
    assert.ok('favStop' in runningPlay.dataset, 'the running favorite offers stop instead of play');
    assert.equal(favRow(runningFavorite, 'DEMO-102').children[0].children[0].children[0].textContent, '\u25cf');
    await runningPlay.onclick();
    assert.equal(runningFavorite.state().phase, 'saved');
    assert.equal(runningFavorite.nodes['[data-favorites]'].hidden, false, 'stop keeps favorites open');

    const failedStart = setup(running(), 1, '30', false, 0, {favorites: [{issue: 'DEMO-103', title: 'Third'}]});
    failedStart.click('fav-open');
    await favRow(failedStart, 'DEMO-103').children[2].onclick();
    assert.match(failedStart.nodes['[data-error]'].textContent, /Network failure/);
    assert.equal(failedStart.nodes['[data-favorites]'].hidden, false, 'a failed start keeps favorites open');
    assert.equal(failedStart.state().issue, 'DEMO-102');

    const favoriteMinutes = setup(running(), 0, '30', false, 0, {favorites: [{issue: 'DEMO-103', title: 'Third'}]});
    favoriteMinutes.click('fav-open');
    assert.equal(favRow(favoriteMinutes, 'DEMO-101'), undefined);
    favRow(favoriteMinutes, 'DEMO-103').children[1].onclick();
    const editor = favoriteMinutes.nodes['[data-fav-list]'].children.find(child => 'favEditor' in child.dataset);
    await editor.children[2].children[1].onclick();
    assert.equal(favoriteMinutes.posts.length, 0, 'empty favorite minutes must not write');
    assert.match(favoriteMinutes.nodes['[data-error]'].textContent, /kladny/);
    editor.children[1].children[1].onclick();
    assert.equal(editor.children[2].children[0].value, '30', 'quick buttons only prefill the minutes');
    assert.equal(favoriteMinutes.posts.length, 0);
    await editor.children[2].children[1].onclick();
    assert.match(favoriteMinutes.posts[0].path, /DEMO-103\/worklog/);
    assert.equal(favoriteMinutes.posts[0].body.timeSpentSeconds, 1800);
    assert.deepEqual(favoriteMinutes.state(), running(), 'favorite minutes keep the running timer untouched');
    assert.equal(favoriteMinutes.nodes['[data-fav-list]'].children.some(child => 'favEditor' in child.dataset), false);

    const openFavorite = setup(null, 0, '30', false, 0, {favorites: [{issue: 'DEMO-101', title: ''}]});
    openFavorite.click('fav-open');
    const openKey = favRow(openFavorite, 'DEMO-101').children[0].children[0];
    assert.equal(openKey.children.at(-1).textContent, 'otev\u0159en\u00fd', 'mark the favorite of the open issue');
    assert.equal(favRow(openFavorite, 'DEMO-101').children[0].children[1].textContent, 'Full issue title <safe text>');
    openFavorite.externalFavorites([]);
    assert.equal(openFavorite.nodes['[data-fav-count]'].textContent, '0', 'reflect favorites changed in another tab');
    assert.match(openFavorite.nodes['[data-fav-list]'].children[0].textContent, /Zat\u00edm tu nic nen\u00ed/);

    for (const raw of ['{broken', JSON.stringify([{issue: 'bad'}]), JSON.stringify([{issue: 'A-1', title: ''}, {issue: 'A-1', title: ''}])]) {
        const broken = setup(null, 0, '30', false, 0, {favorites: raw});
        assert.equal(broken.nodes['[data-fav-count]'].textContent, '!');
        assert.equal(broken.nodes['[data-fav-open]'].dataset.state, 'error');
        broken.click('fav-open');
        assert.match(broken.nodes['[data-fav-error]'].textContent, /poskozeny/);
        assert.equal(broken.nodes['[data-fav-add]'].disabled, true, 'corrupted favorites must not be overwritten');
        assert.equal(favRows(broken).length, 0);
    }

    const full = setup(null, 0, '30', false, 0, {favorites: Array.from({length: 10}, (_, index) => ({issue: `FULL-${index + 1}`, title: 'Full'}))});
    full.click('fav-open');
    full.click('fav-add');
    assert.equal(full.nodes['[data-fav-search]'].disabled, true, 'block the search field when the limit is reached');
    assert.match(full.nodes['[data-fav-error]'].textContent, /maximum 10 obl\u00edben\u00fdch/);
    assert.match(full.nodes['[data-fav-add]'].attributes.title, /maximum 10/);
    console.log('PASS: favorites chip, search/add/remove, stale and failed searches, start/stop/switch, collapse, minutes, cross-tab sync, corruption and limit');
    console.log('PASS: Enter/manual minutes, uninterrupted timer, second boundaries, slow API, failures, legacy recovery, deduplication, switching, cancellation, minimum duration, titles, immediate idle and save/discard toasts, write target, worklog ownership and same-origin issue creation');
})().catch(e => { console.error(e); process.exitCode = 1; });
