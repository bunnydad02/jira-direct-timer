const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}\\jira-workspace-timer.user.js`, 'utf8');
const metadata = source.split('// ==/UserScript==')[0];
for (const directive of ['updateURL', 'downloadURL']) {
    assert.equal(metadata.match(new RegExp(`^// @${directive}\\s+(\\S+)\\s*$`, 'm'))?.[1],
        'https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-timer.user.js');
}

function setup(initial, failureAt = 0, input = '30', existing = false, latency = 0) {
    let state = initial;
    let confirmations = 0;
    const posts = [];
    const persisted = [];
    const nodes = {};
    let panel;
    let now = 200000000;
    let render;
    let interval;
    let onFetch = () => {};
    const location = {pathname: '/browse/DEMO-101', search: ''};
    function element() {
        return {dataset: {}, value: '', children: [], attributes: {},
            get innerHTML() { return this.html; },
            set innerHTML(html) {
                this.html = html;
                for (const [, attribute, text] of html.matchAll(/<button (data-[a-z-]+)>([^<]*)<\/button>/g)) {
                    this.querySelector(`[${attribute}]`).textContent = text;
                }
            },
            querySelector: s => nodes[s] ||= element(),
            appendChild(child) { this.children.push(child); child.parent = this; },
            setAttribute(name, value) { this.attributes[name] = value; },
            remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
            after(child) { if ('cancel' in child.dataset) nodes['[data-cancel]'] = child; }};
    }
    const window = {addEventListener() {}};
    window.top = window;
    class Clock extends Date { static now() { return now; } }
    let id = 0;
    const context = {
        window, document: {body: element(), createElement: tag => { const node = element(); if (tag === 'section') panel = node; return node; }, getElementById: () => null,
            querySelector: selector => selector === '#summary-val' ? {textContent: 'Full issue title <safe text>'} : {content: 'PMA-OLD'}},
        location, URLSearchParams,
        localStorage: {getItem: () => state ? JSON.stringify(state) : null, setItem: (k, v) => { state = JSON.parse(v); }, removeItem: () => { state = null; }},
        Date: Clock, crypto: {randomUUID: () => `manual-${++id}`}, confirm: () => { confirmations++; return true; }, setInterval: (callback, ms) => { render = callback; interval = ms; },
        navigator: {locks: {request: async (k, o, f) => f({})}},
        fetch: async (path, options) => {
            if (path.endsWith('?fields=summary')) return {ok: true, json: async () => ({fields: {summary: 'Other issue full title'}})};
            await Promise.resolve();
            const override = await onFetch(path, options);
            if (override !== undefined) return {ok: true, json: async () => override};
            now += latency;
            if (options.method === 'POST') {
                const body = JSON.parse(options.body);
                posts.push({path, body});
                if (posts.length === failureAt) throw new Error('Network failure');
                persisted.push({path, body});
                return {ok: true, json: async () => ({id: `log-${posts.length}`, timeSpentSeconds: body.timeSpentSeconds})};
            }
            const worklogs = existing ?
                [{id: 'existing', timeSpentSeconds: 120, comment: `[jira-direct-timer:${state.manualEntry?.id || state.id}]`}] :
                persisted.map((post, index) => ({id: `log-${index + 1}`, timeSpentSeconds: post.body.timeSpentSeconds, comment: post.body.comment}));
            return {ok: true, json: async () => ({total: worklogs.length, worklogs})};
        }
    };
    vm.runInNewContext(source, context);
    nodes['[data-minutes]'].value = input;
    return {nodes, panel, posts, styles: context.document.body.children[0].textContent,
        state: () => state, confirmations: () => confirmations, click: name => nodes[`[data-${name}]`].onclick(),
        toasts: () => panel.children.find(child => 'toasts' in child.dataset).children,
        advance: ms => { now += ms; }, render: () => render(), interval: () => interval,
        onFetch: callback => { onFetch = callback; },
        navigate: path => { location.pathname = path; render(); },
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
    assert.match(legacyPanel.panel.innerHTML, /<span data-version><\/span>/);
    assert.equal(legacyPanel.nodes['[data-version]'].textContent, `v${version}`,
        'display the installed userscript version, keeping the label in sync with metadata');
    assert.match(legacyPanel.styles, /\[data-version\] \{position:absolute;top:14px;right:14px;font-size:9px;.*opacity:\.5\}/,
        'keep the version small and unobtrusive in the top-right corner');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(legacyPanel.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 0h');
    assert.equal(legacyPanel.nodes['[data-worklog-total]'].hidden, false);
    for (const [seconds, expected] of [[7200, 'Dosud vykaz\u00e1no: 2h'], [1440, 'Dosud vykaz\u00e1no: 0,4h'], [439200, 'Dosud vykaz\u00e1no: 122h']]) {
        const formatted = setup(null);
        formatted.onFetch(() => ({total: 1, worklogs: [{timeSpentSeconds: seconds}]}));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(formatted.nodes['[data-worklog-total]'].textContent, expected);
    }
    const pagedTotal = setup(null);
    pagedTotal.onFetch(path => {
        const offset = Number(new URLSearchParams(path.split('?')[1]).get('startAt'));
        if (offset === 0) return {total: 3, worklogs: [
            {timeSpentSeconds: 3600}, {timeSpentSeconds: 1800}
        ]};
        return {total: 3, worklogs: [{timeSpentSeconds: 3661}]};
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pagedTotal.nodes['[data-worklog-total]'].textContent, 'Dosud vykaz\u00e1no: 2,5h',
        'sum all worklogs across Jira pages');
    const issueQueries = [];
    pagedTotal.onFetch(path => {
        if (path.includes('/worklog?startAt=')) issueQueries.push(path);
        return {total: 1, worklogs: [{timeSpentSeconds: 60}]};
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
        assert.match(h.panel.innerHTML, /^<strong>Jira stopky<\/strong>/);
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
    console.log('PASS: Enter/manual minutes, uninterrupted timer, second boundaries, slow API, failures, legacy recovery, deduplication, switching, cancellation, minimum duration, titles, immediate idle and save/discard toasts');
})().catch(e => { console.error(e); process.exitCode = 1; });
