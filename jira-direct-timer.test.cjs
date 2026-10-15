const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}\\jira-direct-timer.user.js`, 'utf8');

function setup(initial, failureAt = 0, input = '30', existing = false) {
    let state = initial;
    let confirmations = 0;
    const posts = [];
    const nodes = {};
    let panel;
    let now = 200000000;
    let render;
    function element() {
        return {style: {}, dataset: {}, value: '', querySelector: s => nodes[s] ||= element(), appendChild() {}, insertBefore() {},
            after(child) { if ('cancel' in child.dataset) nodes['[data-cancel]'] = child; }};
    }
    const window = {addEventListener() {}};
    window.top = window;
    class Clock extends Date { static now() { return now; } }
    let id = 0;
    const context = {
        window, document: {body: element(), createElement: tag => { const node = element(); if (tag === 'section') panel = node; return node; }, getElementById: () => null,
            querySelector: selector => selector === '#summary-val' ? {textContent: 'Full issue title <safe text>'} : {content: 'PMA-OLD'}},
        location: {pathname: '/browse/DEMO-101', search: ''}, URLSearchParams,
        localStorage: {getItem: () => state ? JSON.stringify(state) : null, setItem: (k, v) => { state = JSON.parse(v); }, removeItem: () => { state = null; }},
        Date: Clock, crypto: {randomUUID: () => `manual-${++id}`}, confirm: () => { confirmations++; return true; }, setInterval: callback => { render = callback; },
        navigator: {locks: {request: async (k, o, f) => f({})}},
        fetch: async (path, options) => {
            if (path.endsWith('?fields=summary')) return {ok: true, json: async () => ({fields: {summary: 'Other issue full title'}})};
            if (options.method === 'POST') {
                const body = JSON.parse(options.body);
                posts.push({path, body});
                if (posts.length === failureAt) throw new Error('Network failure');
                return {ok: true, json: async () => ({id: `log-${posts.length}`, timeSpentSeconds: body.timeSpentSeconds})};
            }
            return {ok: true, json: async () => ({total: existing ? 1 : 0, worklogs: existing ?
                [{id: 'existing', timeSpentSeconds: 120, comment: `[jira-direct-timer:${state.id}]`}] : []})};
        }
    };
    vm.runInNewContext(source, context);
    nodes['[data-minutes]'].value = input;
    return {nodes, panel, posts, state: () => state, confirmations: () => confirmations, click: name => nodes[`[data-${name}]`].onclick(),
        advance: ms => { now += ms; }, render: () => render()};
}
const running = () => ({id: 'old', issue: 'DEMO-102', started: 199875000, ended: null, phase: 'running'});
(async () => {
    for (const initial of [null, running()]) {
        const h = setup(initial);
        await h.click('manual');
        assert.equal(h.confirmations(), 0, 'manual entry must save without a dialog');
        assert.equal(h.posts.length, initial ? 2 : 1);
        const last = h.posts.at(-1);
        assert.match(last.path, /DEMO-101/);
        assert.equal(last.body.timeSpentSeconds, 1800);
        assert.equal(last.body.started, new Date(200000000 - 1800000).toISOString().replace('Z', '+0000'));
        assert.match(last.body.comment, /Rucni vykaz/);
        assert.equal(h.state().phase, 'saved');
        if (initial) assert.match(h.posts[0].path, /DEMO-102/);
    }
    for (const input of ['', '0', '-1', '1.5', 'NaN', '9999999999999999999']) {
        const h = setup(running(), 0, input);
        await h.click('manual');
        assert.equal(h.posts.length, 0);
        assert.equal(h.state().phase, 'running');
        assert.match(h.nodes['[data-error]'].textContent, /kladny/);
    }
    const h = setup(running(), 1);
    await h.click('manual');
    assert.equal(h.state().phase, 'pending');
    assert.equal(h.state().manualNext.issue, 'DEMO-101');
    await h.click('save');
    assert.equal(h.posts.length, 1, 'uncertain writes must not be repeated');
    const secondFailure = setup(running(), 2);
    await secondFailure.click('manual');
    assert.equal(secondFailure.state().phase, 'pending');
    assert.equal(secondFailure.state().issue, 'DEMO-101');
    assert.equal(secondFailure.posts.length, 2);
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
    const pending = running();
    pending.phase = 'pending';
    pending.ended = 200000000;
    pending.manualNext = old.manualNext;
    const verified = setup(pending, 0, '30', true);
    await verified.click('save');
    assert.equal(verified.posts.length, 0, 'existing markers must not create duplicates');
    assert.equal(verified.state().issue, 'DEMO-101');
    assert.equal(verified.state().phase, 'saved');
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
    assert.equal(fresh.panel.dataset.running, 'false');
    assert.equal(fresh.panel.dataset.other, 'false');
    assert.equal(fresh.nodes['[data-issue]'].hidden, true);
    await fresh.click('start');
    assert.equal(fresh.state().phase, 'running');
    assert.equal(fresh.confirmations(), 0);
    await fresh.click('stop');
    assert.equal(fresh.posts.length, 1);
    assert.equal(fresh.posts[0].body.timeSpentSeconds, 60);
    assert.equal(fresh.state().phase, 'saved');
    assert.equal(fresh.state().completedAt, 200000000);
    assert.equal(fresh.confirmations(), 0);
    assert.equal(fresh.nodes['[data-save-row]'].hidden, true);
    assert.equal(fresh.nodes['[data-status]'].textContent, 'Ulozeno do Jiry');
    fresh.advance(4999);
    fresh.render();
    assert.equal(fresh.nodes['[data-issue]'].hidden, false);
    assert.equal(fresh.nodes['[data-status]'].textContent, 'Ulozeno do Jiry');
    fresh.advance(1);
    fresh.render();
    assert.equal(fresh.nodes['[data-issue]'].hidden, true);
    assert.equal(fresh.nodes['[data-title]'].textContent, '');
    assert.equal(fresh.nodes['[data-clock]'].textContent, '00:00:00');
    assert.equal(fresh.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    assert.equal(fresh.panel.dataset.running, 'false');
    assert.equal(fresh.state().phase, 'saved', 'keep saved marker for duplicate protection');
    const oldSaved = setup({...fresh.state(), completedAt: 200000000 - 6000});
    assert.equal(oldSaved.nodes['[data-status]'].textContent, 'Nyní se nic neměří.');
    const stopFailure = setup(running(), 1);
    await stopFailure.click('stop');
    assert.equal(stopFailure.state().phase, 'pending');
    assert.equal(stopFailure.nodes['[data-save-row]'].hidden, false);
    await stopFailure.click('save');
    assert.equal(stopFailure.posts.length, 1);
    assert.equal(stopFailure.confirmations(), 0);
    const cancelOther = setup(running());
    assert.equal(cancelOther.nodes['[data-cancel]'].hidden, false);
    assert.equal(cancelOther.nodes['[data-cancel]'].textContent, 'CANCEL');
    await cancelOther.click('cancel');
    assert.equal(cancelOther.state(), null);
    assert.equal(cancelOther.posts.length, 0);
    assert.equal(cancelOther.confirmations(), 0);
    assert.equal(cancelOther.nodes['[data-cancel]'].hidden, true);
    assert.equal(cancelOther.nodes['[data-issue]'].hidden, true);
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
    const cancelPending = setup({...running(), ended: 200000000, phase: 'pending'});
    assert.equal(cancelPending.nodes['[data-cancel]'].hidden, true);
    await cancelPending.click('cancel');
    assert.equal(cancelPending.state().phase, 'pending');
    const titled = setup({...running(), title: 'Persisted full title'});
    assert.match(titled.nodes['[data-title]'].textContent, /Persisted full title/);
    const legacyTitle = setup(running());
    await new Promise(resolve => setImmediate(resolve));
    assert.match(legacyTitle.nodes['[data-title]'].textContent, /Other issue full title/);
    assert.equal(legacyTitle.posts.length, 0);
    console.log('PASS: manual 30 min, active timer save order, current issue, invalid input, two failure stages, crash recovery, deduplication, task switching, one-minute minimum');
})().catch(e => { console.error(e); process.exitCode = 1; });
