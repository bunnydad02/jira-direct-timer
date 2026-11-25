'use strict';

(() => {
    const equal = (actual, expected, message = '') => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    };
    const includes = (actual, expected) => {
        if (!actual.includes(expected)) throw new Error(`Expected "${actual}" to contain "${expected}"`);
    };
    const running = (p, issue = 'DEMO-101') => ({
        id: 'legacy-timer', issue, started: p.now() - 125000, ended: null, phase: 'running'
    });
    const color = p => getComputedStyle(p.panel()).backgroundColor;
    const waitFor = async (check, timeout = 2000) => {
        const deadline = Date.now() + timeout;
        while (!check()) {
            if (Date.now() > deadline) throw new Error('Condition not met in time');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    };
    const toast = (p, kind, duration, issue) => {
        const node = p.node(`toast="${kind}"`);
        if (!node) throw new Error(`Missing ${kind} toast`);
        includes(node.textContent, issue);
        equal(node.querySelector('[data-toast-duration]').textContent, duration);
    };
    const scenarios = [
        {title: 'Idle: red state, text, controls and hidden legacy panel', async run(p) {
            await p.reset();
            equal(color(p), 'rgb(255, 242, 242)');
            equal(Math.round(p.panel().getBoundingClientRect().width), 240);
            equal(p.node('clock').textContent, '00:00:00');
            equal(p.node('status').textContent, 'Nothing is being tracked.');
            equal(p.node('start').disabled, false);
            equal(p.node('stop').disabled, true);
            equal(p.node('cancel').hidden, true);
            equal(p.node('save-row').hidden, true);
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
            const legacy = document.createElement('div');
            legacy.id = 'timer-sidebar';
            document.body.appendChild(legacy);
            try { equal(getComputedStyle(legacy).display, 'none'); } finally { legacy.remove(); }
            equal(p.posts().length, 0);
        }},
        {title: 'Version matches metadata and links to GitHub', async run(p) {
            await p.reset();
            const version = window.timerSource.match(/^\/\/ @version\s+(\S+)/m)[1];
            equal(p.node('version').textContent, `v${version}`);
            equal(p.node('version').href, 'https://github.com/bunnydad02/jira-direct-timer');
            equal(p.node('version').target, '_blank');
            equal(p.node('version').rel, 'noopener noreferrer');
            includes(p.node('version').getAttribute('aria-label'), version);
            equal(p.node('release-notes'), null);
            await p.click('start');
            equal(p.node('version').textContent, `v${version}`);
            await p.reload();
            equal(p.node('version').textContent, `v${version}`);
        }},
        {title: 'Personal time excludes colleagues on issues and subtasks, including after saving', async run(p) {
            const colleague = {key: 'colleague', name: 'other', displayName: 'Demo User'};
            await p.reset({
                parents: {'DEMO-102': 'DEMO-101'},
                logs: [
                    {issue: 'DEMO-101', timeSpentSeconds: 4500, author: colleague},
                    {issue: 'DEMO-101', timeSpentSeconds: 0, author: colleague},
                    {issue: 'DEMO-101', timeSpentSeconds: 900, updateAuthor: colleague},
                    {issue: 'DEMO-102', timeSpentSeconds: 7200, author: colleague},
                    {issue: 'DEMO-102', timeSpentSeconds: 1800}
                ]
            });
            equal(p.node('worklog-total').textContent, 'Logged so far: 0.3h (0.8h)');
            equal(p.posts().length, 0);
            await p.manual('15');
            equal(p.node('worklog-total').textContent, 'Logged so far: 0.5h (1h)');
            await p.reload();
            equal(p.node('worklog-total').textContent, 'Logged so far: 0.5h (1h)');
            p.navigate('DEMO-102');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Logged so far: 0.5h');
            await p.reset({logs: [{issue: 'DEMO-101', timeSpentSeconds: 4500, author: colleague}]});
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
        }},
        {title: 'Missing identity or author: visible error, timer works, loading recovers', async run(p) {
            for (const options of [
                {identityError: true},
                {user: {displayName: 'Demo User'}},
                {logs: [{issue: 'DEMO-101', timeSpentSeconds: 900, author: null}]}
            ]) {
                await p.reset(options);
                equal(p.node('worklog-total').dataset.state, 'error');
                equal(p.node('worklog-total').hidden, false);
                equal(p.posts().length, 0);
                await p.click('start');
                equal(p.state().phase, 'running');
                await p.click('stop');
                equal(p.state().phase, 'saved');
                equal(p.posts().length, 1);
                equal(p.node('worklog-total').dataset.state, 'error');
            }
            await p.reset();
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
        }},
        {title: 'Subtask work log error does not show a partial total', async run(p) {
            await p.reset({
                parents: {'DEMO-102': 'DEMO-101'}, worklogErrorIssue: 'DEMO-102',
                logs: [{issue: 'DEMO-101', timeSpentSeconds: 900}]
            });
            equal(p.node('worklog-total').dataset.state, 'error');
            includes(p.node('worklog-total').textContent, 'Simulated work log loading error');
            equal(p.posts().length, 0);
            p.navigate('DEMO-103');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
        }},
        {title: 'Totals with subtasks: parentheses, pagination, navigation and refresh after saving', async run(p) {
            await p.reset({
                parents: {'DEMO-102': 'DEMO-101', 'DEMO-103': 'DEMO-101'},
                logs: [
                    {issue: 'DEMO-101', timeSpentSeconds: 3600},
                    {issue: 'DEMO-101', timeSpentSeconds: 1800},
                    {issue: 'DEMO-101', timeSpentSeconds: 1800},
                    {issue: 'DEMO-102', timeSpentSeconds: 3600},
                    {issue: 'DEMO-103', timeSpentSeconds: 1800}
                ]
            });
            equal(p.node('worklog-total').textContent, 'Logged so far: 2h (3.5h)');
            equal(p.posts().length, 0);
            p.navigate('DEMO-102');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Logged so far: 1h');
            await p.manual('30');
            equal(p.node('worklog-total').textContent, 'Logged so far: 1.5h');
            p.navigate('DEMO-101');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Logged so far: 2h (4h)');
            await p.manual('30');
            equal(p.node('worklog-total').textContent, 'Logged so far: 2.5h (4.5h)');
        }},
        {title: 'Subtasks without work logs and time only in subtasks', async run(p) {
            const parents = {'DEMO-102': 'DEMO-101'};
            await p.reset({parents});
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
            await p.reset({parents, logs: [{issue: 'DEMO-101', timeSpentSeconds: 7200}]});
            equal(p.node('worklog-total').textContent, 'Logged so far: 2h');
            await p.reset({parents, logs: [{issue: 'DEMO-102', timeSpentSeconds: 3600}]});
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h (1h)');
        }},
        {title: 'Subtask summary error is visible and does not block the timer', async run(p) {
            await p.reset({aggregateError: true});
            equal(p.node('worklog-total').dataset.state, 'error');
            includes(p.node('worklog-total').textContent, 'Simulated subtask summary error');
            await p.click('start');
            equal(p.state().phase, 'running');
            await p.click('stop');
            equal(p.posts().length, 1);
            equal(p.state().phase, 'saved');
            equal(p.node('worklog-total').dataset.state, 'error');
            await p.reset();
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
        }},
        {title: 'START: green state, safe title, links and running clock', async run(p) {
            await p.reset();
            await p.click('start');
            equal(color(p), 'rgb(239, 250, 242)');
            equal(p.state().phase, 'running');
            equal(p.node('start').disabled, true);
            equal(p.node('stop').disabled, false);
            equal(p.node('cancel').hidden, false);
            equal(p.node('title').textContent, 'Test issue: implementation <safe text>');
            equal(p.node('title').children.length, 0);
            equal(p.node('issue').href, 'https://jira.alza.cz/browse/DEMO-101');
            equal(p.node('title').href, p.node('issue').href);
            p.advance(125000);
            equal(p.node('clock').textContent, '00:02:05');
            await p.sleep(1100);
            equal(p.node('clock').textContent, '00:02:06');
            equal(p.posts().length, 0);
        }},
        {title: 'Navigation: blue for another issue, no automatic switch', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            p.navigate('DEMO-102');
            await p.idle();
            equal(color(p), 'rgb(237, 244, 255)');
            equal(p.state(), before);
            equal(p.node('measuring').textContent, 'Currently tracking: DEMO-101');
            equal(p.node('measuring').hidden, false);
            equal(p.node('issue').hidden, true);
            equal(p.node('start').disabled, false);
            equal(p.posts().length, 0);
            p.navigate('DEMO-101');
            equal(color(p), 'rgb(239, 250, 242)');
            equal(p.node('measuring').hidden, true);
        }},
        {title: 'STOP: save whole minutes, pending before POST and confirmation', async run(p) {
            await p.reset();
            await p.click('start');
            const started = p.state().started;
            p.advance(125000);
            await p.click('stop');
            equal(p.posts().length, 1);
            const post = p.posts()[0];
            equal(post.body.timeSpentSeconds, 120);
            equal(post.body.started, new Date(started).toISOString().replace('Z', '+0000'));
            includes(post.body.comment, 'Work on issue (Jira timer)');
            includes(post.body.comment, `[jira-direct-timer:${p.state().id}]`);
            equal(post.state.phase, 'pending');
            equal(p.state().phase, 'saved');
            equal(color(p), 'rgb(255, 242, 242)');
            equal(p.node('clock').textContent, '00:00:00');
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
            toast(p, 'saved', '00:02:00', 'DEMO-101');
            equal(p.node('toasts').getAttribute('aria-live'), 'polite');
            equal(p.node('save-row').hidden, true);
        }},
        {title: 'Immediate STOP: minimum one minute', async run(p) {
            await p.reset();
            await p.click('start');
            await p.click('stop');
            equal(p.posts()[0].body.timeSpentSeconds, 60);
            includes(p.posts()[0].body.comment, 'minimum 1 minute');
            toast(p, 'saved', '00:01:00', 'DEMO-101');
        }},
        {title: 'START another issue: save the old one and continue without a gap', async run(p) {
            await p.reset();
            await p.click('start');
            p.advance(125000);
            p.navigate('DEMO-102');
            await p.click('start');
            equal(p.posts()[0].issue, 'DEMO-101');
            equal(p.state().issue, 'DEMO-102');
            equal(p.state().started, p.posts()[0].state.ended);
            equal(p.state().phase, 'running');
            equal(color(p), 'rgb(239, 250, 242)');
            toast(p, 'saved', '00:02:00', 'DEMO-101');
        }},
        {title: 'CANCEL: discard actual duration without POST, even on another issue', async run(p) {
            await p.reset();
            await p.click('start');
            p.advance(43000);
            p.navigate('DEMO-102');
            await p.click('cancel');
            equal(p.state(), null);
            equal(p.logs().length, 0);
            equal(p.posts().length, 0);
            equal(color(p), 'rgb(255, 242, 242)');
            toast(p, 'discarded', '00:00:43', 'DEMO-101');
        }},
        {title: 'ADD MINUTES via button and Enter, ending at submission time', async run(p) {
            await p.reset();
            const before = p.now();
            await p.manual('30');
            const post = p.posts()[0];
            equal(post.body.timeSpentSeconds, 1800);
            includes(post.body.comment, 'Manual work log');
            const start = new Date(post.body.started).getTime();
            if (Math.abs(start + 1800000 - before) > 200) throw new Error('Manual interval does not end at submission');
            equal(p.node('minutes').value, '');
            toast(p, 'saved', '00:30:00', 'DEMO-101');
            await p.manual('20', true);
            equal(p.posts().length, 2);
            equal(p.posts()[1].body.timeSpentSeconds, 1200);
            equal(p.node('worklog-total').textContent, 'Logged so far: 0.8h');
        }},
        {title: 'ADD MINUTES and +min: zero or blank logs nothing and shows a toast', async run(p) {
            const state = running(p, 'DEMO-102');
            await p.reset({state, favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            for (const value of ['0', '']) {
                await p.manual(value);
                equal(p.posts().length, 0, `${JSON.stringify(value)} must not write`);
                equal(p.state(), state, 'running timer unchanged');
                equal(p.node('error').textContent, '');
                equal(p.node('minutes').value, '');
                includes(p.node('toast="empty"').textContent, 'Nothing was logged');
            }
            await p.click('fav-open');
            for (const value of ['0', '']) {
                p.node('fav-list').querySelector('[data-fav-minutes]').click();
                p.node('fav-minutes-input').value = value;
                p.node('fav-minutes-input').dispatchEvent(new Event('input'));
                p.node('fav-minutes-save').click();
                await p.idle();
                equal(p.posts().length, 0);
                equal(p.node('fav-editor'), null, 'zero minutes close the editor');
                equal(p.node('error').textContent, '');
            }
            equal(p.node('toasts').querySelectorAll('[data-toast="empty"]').length, 4);
            equal(p.state(), state);
            await p.manual('-5');
            includes(p.node('error').textContent, 'positive');
            equal(p.node('error').textContent.includes('duplicate'), false, 'validation omits the duplicate warning');
        }},
        {title: 'AUTO: log new issues only when enabled and preserve timer', async run(p) {
            await p.reset();
            equal(p.node('auto-open').dataset.state, 'off');
            equal(p.node('auto-open').textContent, 'auto');
            await p.createIssue();
            equal(p.posts().length, 0, 'automatic reporting must be off by default');
            await p.click('auto-open');
            equal(p.node('auto-enabled').checked, false);
            equal(p.node('auto-minutes').disabled, true);
            p.node('auto-enabled').checked = true;
            p.node('auto-enabled').dispatchEvent(new Event('change', {bubbles: true}));
            equal(p.node('auto-minutes').disabled, false);
            p.node('auto-minutes').value = '10';
            await p.click('auto-save');
            equal(p.node('auto-open').dataset.state, 'on', 'the panel must show enabled AUTO without opening settings');
            equal(p.node('auto-open').textContent, 'auto');
            includes(p.node('auto-open').title, 'AUTO on: 10 min');
            await p.click('start');
            const timer = p.state();
            await p.createIssue();
            equal(p.posts().length, 1);
            equal(p.posts()[0].issue, 'DEMO-104');
            equal(p.posts()[0].body.timeSpentSeconds, 600);
            includes(p.posts()[0].body.comment, 'Automatic work log');
            equal(p.state(), timer, 'automatic reporting must not replace the running timer');
        }},
        {title: 'AUTO: Jira Sub-task Bug form logs 11 minutes, recovery without duplicates', async run(p) {
            await p.reset({autoSettings: {enabled: true, minutes: 11}});
            await p.click('start');
            const timer = p.state();
            p.failure('after');
            await p.createIssue(true);
            equal(p.posts().length, 1);
            equal(p.posts()[0].issue, 'DEMO-104');
            equal(p.posts()[0].body.timeSpentSeconds, 660);
            includes(p.posts()[0].body.comment, '[jira-direct-timer:auto-DEMO-104]');
            includes(p.node('error').textContent, 'Simulated response loss');
            equal(p.state(), timer);
            await p.reload();
            equal(p.posts().length, 1, 'reload must verify the marker, not repeat the POST');
            equal(p.logs().length, 1);
            await p.createIssue(true);
            equal(p.posts().length, 1, 'repeated creation notification must not duplicate the worklog');
            equal(p.state(), timer);
        }},
        {title: 'ADD MINUTES while running does not change the timer, even on another issue', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            p.navigate('DEMO-102');
            await p.manual('10', true);
            equal(p.state(), before);
            equal(p.posts()[0].issue, 'DEMO-102');
            equal(p.posts()[0].state.manualEntry.phase, 'pending');
            equal(color(p), 'rgb(237, 244, 255)');
            equal(p.node('stop').disabled, false);
            toast(p, 'saved', '00:10:00', 'DEMO-102');
        }},
        {title: 'Invalid minutes: error, no entry or timer change', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            for (const value of ['-1', '1.5', '9999999999999999999']) {
                await p.manual(value);
                includes(p.node('error').textContent, 'positive');
                equal(p.node('error').textContent.includes('duplicate'), false);
                equal(p.state(), before);
                equal(p.posts().length, 0);
                equal(p.node('toast'), null);
            }
        }},
        {title: 'Reload: restore timer and saved marker without replaying toast', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            p.advance(125000);
            await p.reload();
            equal(p.state(), before);
            equal(p.node('clock').textContent, '00:02:05');
            await p.click('stop');
            const saved = p.state();
            await p.reload();
            equal(p.state(), saved);
            equal(p.node('toast'), null);
            equal(p.node('cancel').hidden, true);
            equal(p.posts().length, 1);
        }},
        {title: 'Toasts: separate confirmations, expiration and no confirmation dialogs', async run(p) {
            await p.reset();
            await p.click('start');
            p.advance(43000);
            await p.click('cancel');
            p.advance(1000);
            await p.click('start');
            await p.click('stop');
            equal(p.node('toasts').children.length, 2);
            p.advance(4000);
            equal(p.node('toasts').children.length, 1);
            p.advance(1000);
            equal(p.node('toasts').children.length, 0);
        }},
        {title: 'Slow save: stable colors and text, double-click blocked', async run(p) {
            await p.reset({latency: 200});
            await p.click('start');
            const status = p.node('status').textContent;
            p.node('stop').click();
            equal(p.node('stop').disabled, true);
            equal(p.node('start').disabled, true);
            equal(p.node('manual').disabled, true);
            equal(p.node('cancel').disabled, true);
            p.node('stop').click();
            await p.sleep(250);
            equal(color(p), 'rgb(239, 250, 242)');
            equal(p.node('status').textContent, status);
            equal(p.node('save-row').hidden, true);
            await p.idle();
            equal(p.posts().length, 1);
            equal(color(p), 'rgb(255, 242, 242)');
        }},
        {title: 'Lost POST: pending and verification without retry', async run(p) {
            await p.reset();
            await p.click('start');
            p.failure('before');
            await p.click('stop');
            equal(p.state().phase, 'pending');
            equal(p.node('toast'), null);
            equal(p.node('save-row').hidden, false);
            includes(p.node('save').textContent, 'without retrying');
            includes(p.node('error').textContent, 'Simulated');
            await p.click('save');
            equal(p.posts().length, 1);
            includes(p.node('error').textContent, 'not be retried automatically');
            await p.reload();
            includes(p.node('status').textContent, 'Uncertain');
            await p.click('save');
            equal(p.posts().length, 1);
        }},
        {title: 'Saved but response lost: marker confirms save without duplicates', async run(p) {
            await p.reset();
            await p.click('start');
            p.failure('after');
            await p.click('stop');
            equal(p.state().phase, 'pending');
            equal(p.logs().length, 1);
            await p.reload();
            await p.click('save');
            equal(p.state().phase, 'saved');
            equal(p.posts().length, 1);
            equal(p.logs().length, 1);
            toast(p, 'saved', '00:01:00', 'DEMO-101');
        }},
        {title: 'Switch failure: preserve destination and continuation time on recovery', async run(p) {
            await p.reset();
            await p.click('start');
            p.advance(125000);
            p.navigate('DEMO-102');
            p.failure('after');
            await p.click('start');
            equal(p.state().nextIssue, 'DEMO-102');
            const ended = p.state().ended;
            await p.reload();
            await p.click('save');
            equal(p.state().phase, 'running');
            equal(p.state().issue, 'DEMO-102');
            equal(p.state().started, ended);
            equal(p.posts().length, 1);
        }},
        {title: 'Uncertain manual entry: block actions and recover while timer runs', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            p.navigate('DEMO-102');
            p.failure('after');
            await p.manual('10');
            equal(p.state().phase, 'running');
            equal(p.state().manualEntry.phase, 'pending');
            for (const name of ['start', 'stop', 'cancel', 'manual']) equal(p.node(name).disabled, true);
            equal(p.node('toast'), null);
            await p.reload();
            await p.click('save');
            equal(p.state(), before);
            equal(p.posts().length, 1);
            equal(p.node('stop').disabled, false);
            toast(p, 'saved', '00:10:00', 'DEMO-102');
        }},
        {title: 'Legacy stopped + manualNext: two saved entries and recovery', async run(p) {
            const old = {...running(p), ended: p.now(), phase: 'stopped'};
            await p.reset({state: old, issue: 'DEMO-102'});
            p.failure('after');
            await p.manual('10');
            equal(p.state().manualNext.issue, 'DEMO-102');
            equal(p.state().phase, 'pending');
            await p.reload();
            await p.click('save');
            equal(p.state().phase, 'saved');
            equal(p.state().issue, 'DEMO-102');
            equal(p.posts().length, 2);
            equal(p.logs().length, 2);
            equal(p.node('toasts').children.length, 2);
        }},
        {title: 'All-page totals, issue change and invalidation after save', async run(p) {
            const logs = [3600, 1800, 3661].map((timeSpentSeconds, index) => ({
                id: `seed-${index}`, issue: 'DEMO-101', timeSpentSeconds, comment: 'Fixture'
            }));
            await p.reset({logs});
            equal(p.node('worklog-total').textContent, 'Logged so far: 2.5h');
            includes(p.requests().map(value => value.path).join('\n'), 'startAt=2');
            p.navigate('DEMO-102');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Logged so far: 0h');
            p.navigate('DEMO-101');
            await p.manual('30');
            equal(p.node('worklog-total').textContent, 'Logged so far: 3h');
        }},
        {title: 'Marker on a later page: verification without POST', async run(p) {
            const state = {...running(p), ended: p.now(), phase: 'pending'};
            const logs = [0, 1, 2].map(index => ({
                id: `seed-${index}`, issue: state.issue, timeSpentSeconds: 120,
                comment: index === 2 ? `[jira-direct-timer:${state.id}]` : '[jira-direct-timer:unrelated]'
            }));
            await p.reset({state, logs});
            await p.click('save');
            equal(p.state().worklogId, 'seed-2');
            equal(p.posts().length, 0);
            toast(p, 'saved', '00:02:00', 'DEMO-101');
        }},
        {title: 'selectedIssue on an issue page logs to the open issue', async run(p) {
            await p.reset();
            p.search('?selectedIssue=DEMO-102');
            equal(p.node('target'), null);
            await p.manual('5');
            equal(p.posts().map(value => value.issue), ['DEMO-101']);
            await p.click('start');
            equal(p.state().issue, 'DEMO-101');
        }},
        {title: 'Another author\'s work log marker does not confirm a save', async run(p) {
            const state = {...running(p), ended: p.now(), phase: 'stopped'};
            const colleague = {key: 'colleague', name: 'other', displayName: 'Demo User'};
            await p.reset({state, logs: [{id: 'foreign', issue: state.issue, timeSpentSeconds: 600, author: colleague,
                comment: `[jira-direct-timer:${state.id}]`}]});
            await p.click('save');
            equal(p.posts().length, 1);
            equal(p.state().phase, 'saved');
            equal(p.state().worklogId, 'mock-2');
        }},
        {title: 'Totals error remains visible instead of becoming zero', async run(p) {
            await p.reset({totalError: true});
            equal(p.node('worklog-total').dataset.state, 'error');
            includes(p.node('worklog-total').textContent, 'Simulated work log loading error');
            equal(p.node('worklog-total').hidden, false);
            equal(p.posts().length, 0);
        }},
        {title: 'Corrupted state is preserved and write actions blocked', async run(p) {
            for (const raw of ['{broken', JSON.stringify({issue: 'DEMO-101', phase: 'invalid'})]) {
                await p.reset({raw});
                for (const name of ['start', 'stop', 'save', 'manual']) equal(p.node(name).disabled, true);
                if (!p.node('error').textContent) throw new Error('Missing storage error');
                equal(document.querySelector('#state').textContent, raw);
                equal(p.posts().length, 0);
            }
        }},
        {title: 'Lock missing or held by another tab: explicit error without a write', async run(p) {
            for (const lock of ['missing', 'busy']) {
                await p.reset({lock});
                await p.click('start');
                equal(p.state(), null);
                equal(p.posts().length, 0);
                includes(p.node('error').textContent, lock === 'missing' ? 'locking' : 'Another tab');
            }
        }},
        {title: 'Storage event from another tab redraws panel without a write', async run(p) {
            await p.reset();
            const state = running(p, 'DEMO-102');
            p.externalState(state);
            await p.idle();
            equal(p.state(), state);
            equal(color(p), 'rgb(237, 244, 255)');
            equal(p.node('clock').textContent, '00:02:05');
            equal(p.node('title').textContent, 'Test issue: checks and fixes');
            equal(p.posts().length, 0);
        }},
        {title: 'No open issue: START/manual blocked, STOP of tracked issue allowed', async run(p) {
            await p.reset({issue: ''});
            equal(p.node('start').disabled, true);
            equal(p.node('manual').disabled, true);
            equal(p.node('worklog-total').hidden, true);
            p.externalState(running(p));
            await p.idle();
            equal(p.node('stop').disabled, false);
            await p.click('stop');
            equal(p.posts()[0].issue, 'DEMO-101');
        }},
        {title: 'Favorites: chip, search, new-tab link, add and remove', async run(p) {
            await p.reset({issue: 'OPS-12', favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            equal(p.node('fav-count').textContent, '1');
            equal(p.node('favorites').hidden, true);
            await p.click('fav-open');
            equal(p.node('fav-open').hidden, true, 'chip hidden while open');
            equal(p.node('fav-list').querySelector('[data-fav-mark]'), null, 'open issue has no extra label');
            const section = p.node('favorites').getBoundingClientRect();
            if (section.bottom > p.node('header').getBoundingClientRect().top + 1) throw new Error('Favorites must sit above the timer header');
            await p.click('fav-add');
            const search = p.node('fav-search');
            equal(document.activeElement, search, 'search focused');
            const searchTop = search.getBoundingClientRect().top;
            const panelTop = p.node('header').closest('section').getBoundingClientRect().top;
            search.value = 'r';
            search.dispatchEvent(new Event('input'));
            search.value = 'review';
            search.dispatchEvent(new Event('input'));
            await waitFor(() => p.node('fav-results').querySelectorAll('[data-fav-issue]').length === 2);
            equal([search.getBoundingClientRect().top, p.node('header').closest('section').getBoundingClientRect().top], [searchTop, panelTop], 'results float without moving the search or panel');
            equal(p.node('fav-list').hidden, false);
            const link = p.node('fav-issue="OPS-140"').querySelector('a');
            equal([link.target, link.rel, link.href], ['_blank', 'noopener noreferrer', 'https://jira.alza.cz/browse/OPS-140']);
            link.click();
            includes(document.querySelector('#link-info').textContent, 'to a new tab');
            equal(search.value, 'review', 'opening a result keeps the search');
            equal(p.favorites().length, 1, 'opening a result does not save it');
            p.node('fav-issue="OPS-140"').querySelector('[data-fav-pin]').click();
            equal(p.favorites().map(value => value.issue), ['OPS-12', 'OPS-140']);
            equal([p.node('fav-search-wrap').hidden, search.value, p.node('fav-results').hidden], [true, '', true]);
            const added = p.node('fav-list').querySelector('[data-fav-issue="OPS-140"]');
            if (!added.hasAttribute('data-fresh')) throw new Error('New favorite must be highlighted');
            await p.click('fav-add');
            search.value = 'xx';
            search.dispatchEvent(new Event('input'));
            await p.click('fav-search-close');
            equal([p.node('fav-search-wrap').hidden, search.value, p.node('favorites').hidden], [true, '', false], 'search cross closes only the search');
            added.querySelector('[data-fav-menu-toggle]').click();
            p.node('fav-remove').click();
            equal(p.favorites().map(value => value.issue), ['OPS-12']);
            equal(p.posts().length, 0);
        }},
        {title: 'Favorites: project name, custom name, emoji and restore', async run(p) {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            await p.click('fav-open');
            await p.idle();
            includes(p.node('fav-key').textContent, 'Quality Assurance · OPS-12');
            equal(p.node('fav-summary-text').textContent, 'Meetings and communication');
            p.node('fav-menu-toggle').click();
            equal(document.activeElement, p.node('fav-rename'), 'keyboard focus enters the menu');
            p.node('fav-rename').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
            equal(document.activeElement, p.node('fav-menu-toggle'), 'Escape returns focus to the menu button');
            p.node('fav-menu-toggle').click();
            p.node('fav-rename').click();
            equal(document.activeElement, p.node('fav-name-input'));
            p.node('fav-name-input').value = '📚 Learning <safe>';
            p.node('fav-name-input').dispatchEvent(new Event('input'));
            p.node('fav-name-save').click();
            equal(p.favorites()[0].customTitle, '📚 Learning <safe>');
            equal(p.node('fav-summary-text').textContent, '📚 Learning <safe>');
            await p.reload();
            await p.click('fav-open');
            equal(p.node('fav-summary-text').textContent, '📚 Learning <safe>');
            p.node('fav-menu-toggle').click();
            p.node('fav-rename').click();
            p.node('fav-name-input').value = 'Unsaved';
            p.node('fav-name-input').dispatchEvent(new Event('input'));
            p.node('fav-name-cancel').click();
            equal(p.node('fav-summary-text').textContent, '📚 Learning <safe>');
            equal(document.activeElement, p.node('fav-menu-toggle'), 'cancel returns focus to the edited task');
            p.node('fav-menu-toggle').click();
            p.node('fav-rename').click();
            p.node('fav-name-reset').click();
            equal(p.favorites()[0], {issue: 'OPS-12', title: 'Meetings and communication'});
            equal(p.node('fav-summary-text').textContent, 'Meetings and communication');
            equal(p.posts().length, 0);
            await p.reset({projectError: true, favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            await p.click('fav-open');
            await p.idle();
            includes(p.node('fav-key').textContent, 'OPS · OPS-12 · project not loaded');
            p.projectFailure(false);
            p.node('fav-menu-toggle').click();
            p.node('fav-project-retry').click();
            await p.idle();
            includes(p.node('fav-key').textContent, 'Quality Assurance · OPS-12');
            await p.reset({latency: 200, favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            p.node('fav-open').click();
            p.node('fav-menu-toggle').click();
            await p.idle();
            equal(document.activeElement, p.node('fav-rename'), 'project response preserves menu focus');
            await p.reset({latency: 200, favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            p.node('fav-open').click();
            p.node('fav-menu-toggle').click();
            p.node('fav-rename').click();
            p.node('fav-name-input').value = '📚 In progress';
            p.node('fav-name-input').dispatchEvent(new Event('input'));
            await p.idle();
            equal(p.node('fav-name-input').value, '📚 In progress', 'project response keeps the draft');
            equal(document.activeElement, p.node('fav-name-input'), 'project response preserves editing focus');
            await p.reset({favorites: Array.from({length: 10}, (_, index) => ({issue: `OPS-${index + 1}`, title: 'Long issue title'}))});
            await p.click('fav-open');
            const list = p.node('fav-list');
            if (list.scrollHeight <= list.clientHeight) throw new Error('Long favorites list must scroll');
            const start = p.node('fav-start').getBoundingClientRect();
            const minutes = p.node('fav-minutes').getBoundingClientRect();
            if (start.width < 48 || start.height < 36 || minutes.width < 48 || minutes.height < 36) throw new Error('Favorite actions must be easy to click');
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Original', customTitle: 42}]});
            await p.click('fav-open');
            includes(p.node('fav-error').textContent, 'corrupted');
            equal(p.favorites()[0].customTitle, 42, 'invalid custom titles are never overwritten');
        }},
        {title: 'Favorites: START switches the running timer and closes smoothly', async run(p) {
            await p.reset({state: running(p, 'DEMO-102'), favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            await p.click('fav-open');
            const row = p.node('fav-list').querySelector('[data-fav-issue="OPS-12"]');
            row.querySelector('[data-fav-start]').click();
            await p.idle();
            equal(p.posts()[0].issue, 'DEMO-102');
            equal([p.state().issue, p.state().phase], ['OPS-12', 'running']);
            equal(p.node('favorites').hasAttribute('data-closing'), true, 'collapse is animated');
            await waitFor(() => p.node('favorites').hidden);
            equal(p.node('fav-open').hidden, false);
            includes(p.node('measuring').textContent, 'OPS-12');
            toast(p, 'saved', '00:02:00', 'DEMO-102');
        }},
        {title: 'Favorites: +min on selected issue, limit and corrupted list', async run(p) {
            const state = running(p, 'DEMO-102');
            await p.reset({state, favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}]});
            await p.click('fav-open');
            p.node('fav-list').querySelector('[data-fav-minutes]').click();
            equal(document.activeElement, p.node('fav-minutes-input'));
            [...p.node('fav-editor').querySelectorAll('[data-fav-quick]')].find(node => node.textContent === '30').click();
            equal(p.node('fav-minutes-input').value, '30');
            equal(p.posts().length, 0, 'quick buttons only prefill');
            p.node('fav-minutes-save').click();
            await p.idle();
            equal([p.posts()[0].issue, p.posts()[0].body.timeSpentSeconds], ['OPS-12', 1800]);
            equal(p.state(), state, 'running timer unchanged');
            equal(p.node('fav-editor'), null);
            await p.reset({favorites: Array.from({length: 10}, (_, index) => ({issue: `FULL-${index + 1}`, title: 'Full list'}))});
            await p.click('fav-open');
            await p.click('fav-add');
            equal(p.node('fav-search').disabled, true);
            includes(p.node('fav-limit').textContent, '10 favorites');
            equal(p.node('fav-limit').hidden, false);
            await p.reset({favorites: '{broken'});
            equal(p.node('fav-count').textContent, '!');
            await p.click('fav-open');
            includes(p.node('fav-error').textContent, 'corrupted');
            equal(p.node('fav-add').disabled, true);
            equal(p.favoritesRaw(), '{broken', 'corrupted favorites are never overwritten');
            equal(p.posts().length, 0);
        }}
    ];
    const regression = {
        scenarios,
        async run(index) {
            await window.playground.ready;
            await scenarios[index].run(window.playground);
        }
    };
    if (typeof module !== 'undefined') module.exports = regression;
    else window.regression = regression;
})();
