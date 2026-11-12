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
        {title: 'Idle: cervena, texty, ovladani, skryti stareho panelu', async run(p) {
            await p.reset();
            equal(color(p), 'rgb(255, 242, 242)');
            equal(Math.round(p.panel().getBoundingClientRect().width), 240);
            equal(p.node('clock').textContent, '00:00:00');
            equal(p.node('status').textContent, 'Nyn\u00ed se nic nem\u011b\u0159\u00ed.');
            equal(p.node('start').disabled, false);
            equal(p.node('stop').disabled, true);
            equal(p.node('cancel').hidden, true);
            equal(p.node('save-row').hidden, true);
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
            const legacy = document.createElement('div');
            legacy.id = 'timer-sidebar';
            document.body.appendChild(legacy);
            try { equal(getComputedStyle(legacy).display, 'none'); } finally { legacy.remove(); }
            equal(p.posts().length, 0);
        }},
        {title: 'Verze odpovida metadatum a odkazuje na GitHub', async run(p) {
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
        {title: 'Vlastni cas: kolega se nezapocita na tasku ani subtasku, ani po zapisu', async run(p) {
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
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0,3h (0,8h)');
            equal(p.posts().length, 0);
            await p.manual('15');
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0,5h (1h)');
            await p.reload();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0,5h (1h)');
            p.navigate('DEMO-102');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0,5h');
            await p.reset({logs: [{issue: 'DEMO-101', timeSpentSeconds: 4500, author: colleague}]});
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
        }},
        {title: 'Identita nebo autor chybi: viditelna chyba, stopky funguji, obnova nacteni', async run(p) {
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
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
        }},
        {title: 'Chyba worklogu subtasku nezobrazi castecny soucet', async run(p) {
            await p.reset({
                parents: {'DEMO-102': 'DEMO-101'}, worklogErrorIssue: 'DEMO-102',
                logs: [{issue: 'DEMO-101', timeSpentSeconds: 900}]
            });
            equal(p.node('worklog-total').dataset.state, 'error');
            includes(p.node('worklog-total').textContent, 'Simulovana chyba nacteni worklogu');
            equal(p.posts().length, 0);
            p.navigate('DEMO-103');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
        }},
        {title: 'Soucty se subtasky: zavorka, strankovani, navigace a obnoveni po zapisu', async run(p) {
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
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 2h (3,5h)');
            equal(p.posts().length, 0);
            p.navigate('DEMO-102');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 1h');
            await p.manual('30');
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 1,5h');
            p.navigate('DEMO-101');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 2h (4h)');
            await p.manual('30');
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 2,5h (4,5h)');
        }},
        {title: 'Subtasky bez worklogu: bez zavorky; cas jen v subtasku: se zavorkou', async run(p) {
            const parents = {'DEMO-102': 'DEMO-101'};
            await p.reset({parents});
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
            await p.reset({parents, logs: [{issue: 'DEMO-101', timeSpentSeconds: 7200}]});
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 2h');
            await p.reset({parents, logs: [{issue: 'DEMO-102', timeSpentSeconds: 3600}]});
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h (1h)');
        }},
        {title: 'Chyba souhrnu subtasku je viditelna a neblokuje stopky', async run(p) {
            await p.reset({aggregateError: true});
            equal(p.node('worklog-total').dataset.state, 'error');
            includes(p.node('worklog-total').textContent, 'Simulovana chyba souhrnu subtasku');
            await p.click('start');
            equal(p.state().phase, 'running');
            await p.click('stop');
            equal(p.posts().length, 1);
            equal(p.state().phase, 'saved');
            equal(p.node('worklog-total').dataset.state, 'error');
            await p.reset();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
        }},
        {title: 'START: zelena, bezpecny titul, odkazy a bezici hodiny', async run(p) {
            await p.reset();
            await p.click('start');
            equal(color(p), 'rgb(239, 250, 242)');
            equal(p.state().phase, 'running');
            equal(p.node('start').disabled, true);
            equal(p.node('stop').disabled, false);
            equal(p.node('cancel').hidden, false);
            equal(p.node('title').textContent, 'Testovaci task: implementace <bezpecny text>');
            equal(p.node('title').children.length, 0);
            equal(p.node('issue').href, 'https://jira.alza.cz/browse/DEMO-101');
            equal(p.node('title').href, p.node('issue').href);
            p.advance(125000);
            equal(p.node('clock').textContent, '00:02:05');
            await p.sleep(1100);
            equal(p.node('clock').textContent, '00:02:06');
            equal(p.posts().length, 0);
        }},
        {title: 'Navigace: modra pro jiny task, bez automatickeho prepnuti', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            p.navigate('DEMO-102');
            await p.idle();
            equal(color(p), 'rgb(237, 244, 255)');
            equal(p.state(), before);
            equal(p.node('measuring').textContent, 'Nyn\u00ed se m\u011b\u0159\u00ed: DEMO-101');
            equal(p.node('measuring').hidden, false);
            equal(p.node('issue').hidden, true);
            equal(p.node('start').disabled, false);
            equal(p.posts().length, 0);
            p.navigate('DEMO-101');
            equal(color(p), 'rgb(239, 250, 242)');
            equal(p.node('measuring').hidden, true);
        }},
        {title: 'STOP: ulozeni, cele minuty, pending pred POST a potvrzeni', async run(p) {
            await p.reset();
            await p.click('start');
            const started = p.state().started;
            p.advance(125000);
            await p.click('stop');
            equal(p.posts().length, 1);
            const post = p.posts()[0];
            equal(post.body.timeSpentSeconds, 120);
            equal(post.body.started, new Date(started).toISOString().replace('Z', '+0000'));
            includes(post.body.comment, `[jira-direct-timer:${p.state().id}]`);
            equal(post.state.phase, 'pending');
            equal(p.state().phase, 'saved');
            equal(color(p), 'rgb(255, 242, 242)');
            equal(p.node('clock').textContent, '00:00:00');
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
            toast(p, 'saved', '00:02:00', 'DEMO-101');
            equal(p.node('toasts').getAttribute('aria-live'), 'polite');
            equal(p.node('save-row').hidden, true);
        }},
        {title: 'Okamzity STOP: minimalne jedna minuta', async run(p) {
            await p.reset();
            await p.click('start');
            await p.click('stop');
            equal(p.posts()[0].body.timeSpentSeconds, 60);
            includes(p.posts()[0].body.comment, 'minimum 1 minuta');
            toast(p, 'saved', '00:01:00', 'DEMO-101');
        }},
        {title: 'START jineho tasku: ulozit stary, navazat bez mezery', async run(p) {
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
        {title: 'CANCEL: zahozeni skutecne delky bez POST i na jinem tasku', async run(p) {
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
        {title: 'ADD MINUTES tlacitkem i Enterem, cas konci pri odeslani', async run(p) {
            await p.reset();
            const before = p.now();
            await p.manual('30');
            const post = p.posts()[0];
            equal(post.body.timeSpentSeconds, 1800);
            includes(post.body.comment, 'Rucni vykaz');
            const start = new Date(post.body.started).getTime();
            if (Math.abs(start + 1800000 - before) > 200) throw new Error('Manual interval does not end at submission');
            equal(p.node('minutes').value, '');
            toast(p, 'saved', '00:30:00', 'DEMO-101');
            await p.manual('20', true);
            equal(p.posts().length, 2);
            equal(p.posts()[1].body.timeSpentSeconds, 1200);
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0,8h');
        }},
        {title: 'AUTO: nove issue vykazuje jen po zapnuti a zachova stopky', async run(p) {
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
            includes(p.node('auto-open').title, 'AUTO zapnuto: 10 min');
            await p.click('start');
            const timer = p.state();
            await p.createIssue();
            equal(p.posts().length, 1);
            equal(p.posts()[0].issue, 'DEMO-104');
            equal(p.posts()[0].body.timeSpentSeconds, 600);
            includes(p.posts()[0].body.comment, 'Automaticky vykaz');
            equal(p.state(), timer, 'automatic reporting must not replace the running timer');
        }},
        {title: 'AUTO: Sub-task Bug pres Jira formular vykaze 11 minut, obnova bez duplicit', async run(p) {
            await p.reset({autoSettings: {enabled: true, minutes: 11}});
            await p.click('start');
            const timer = p.state();
            p.failure('after');
            await p.createIssue(true);
            equal(p.posts().length, 1);
            equal(p.posts()[0].issue, 'DEMO-104');
            equal(p.posts()[0].body.timeSpentSeconds, 660);
            includes(p.posts()[0].body.comment, '[jira-direct-timer:auto-DEMO-104]');
            includes(p.node('error').textContent, 'Simulovana ztrata odpovedi');
            equal(p.state(), timer);
            await p.reload();
            equal(p.posts().length, 1, 'reload must verify the marker, not repeat the POST');
            equal(p.logs().length, 1);
            await p.createIssue(true);
            equal(p.posts().length, 1, 'repeated creation notification must not duplicate the worklog');
            equal(p.state(), timer);
        }},
        {title: 'ADD MINUTES za behu nemeni mereni ani na jinem tasku', async run(p) {
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
        {title: 'Neplatne minuty: chyba, zadny zapis ani zmena timeru', async run(p) {
            await p.reset();
            await p.click('start');
            const before = p.state();
            for (const value of ['', '0', '-1', '1.5', '9999999999999999999']) {
                await p.manual(value);
                includes(p.node('error').textContent, 'kladny');
                equal(p.state(), before);
                equal(p.posts().length, 0);
                equal(p.node('toast'), null);
            }
        }},
        {title: 'Reload: obnova timeru i saved markeru bez opakovani toastu', async run(p) {
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
        {title: 'Toasty: oddelena potvrzeni, expirace a zadne potvrzovaci dialogy', async run(p) {
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
        {title: 'Pomaly zapis: stabilni barvy a texty, blokovani dvojkliku', async run(p) {
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
        {title: 'Ztraceny POST: pending a overeni bez opakovani zapisu', async run(p) {
            await p.reset();
            await p.click('start');
            p.failure('before');
            await p.click('stop');
            equal(p.state().phase, 'pending');
            equal(p.node('toast'), null);
            equal(p.node('save-row').hidden, false);
            includes(p.node('save').textContent, 'bez opakovani');
            includes(p.node('error').textContent, 'Simulovana');
            await p.click('save');
            equal(p.posts().length, 1);
            includes(p.node('error').textContent, 'neopakuji');
            await p.reload();
            includes(p.node('status').textContent, 'Nejisty');
            await p.click('save');
            equal(p.posts().length, 1);
        }},
        {title: 'Ulozeno, odpoved ztracena: marker obnovi save bez duplicity', async run(p) {
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
        {title: 'Chyba pri prepnuti: zachovat cil a navazujici cas po obnove', async run(p) {
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
        {title: 'Nejisty rucni zapis: blokace a obnova pri bezicim timeru', async run(p) {
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
        {title: 'Legacy stopped + manualNext: dva ulozene zaznamy a obnova', async run(p) {
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
        {title: 'Soucty vsech stran, zmena tasku a invalidace po ulozeni', async run(p) {
            const logs = [3600, 1800, 3661].map((timeSpentSeconds, index) => ({
                id: `seed-${index}`, issue: 'DEMO-101', timeSpentSeconds, comment: 'Fixture'
            }));
            await p.reset({logs});
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 2,5h');
            includes(p.requests().map(value => value.path).join('\n'), 'startAt=2');
            p.navigate('DEMO-102');
            await p.idle();
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 0h');
            p.navigate('DEMO-101');
            await p.manual('30');
            equal(p.node('worklog-total').textContent, 'Dosud vykaz\u00e1no: 3h');
        }},
        {title: 'Marker az na dalsi strance: overeni bez POST', async run(p) {
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
        {title: 'Odkaz se selectedIssue na strance tasku zapisuje do otevreneho tasku', async run(p) {
            await p.reset();
            p.search('?selectedIssue=DEMO-102');
            equal(p.node('target'), null);
            await p.manual('5');
            equal(p.posts().map(value => value.issue), ['DEMO-101']);
            await p.click('start');
            equal(p.state().issue, 'DEMO-101');
        }},
        {title: 'Cizi worklog s markerem neni povazovan za ulozeny', async run(p) {
            const state = {...running(p), ended: p.now(), phase: 'stopped'};
            const colleague = {key: 'colleague', name: 'other', displayName: 'Demo User'};
            await p.reset({state, logs: [{id: 'foreign', issue: state.issue, timeSpentSeconds: 600, author: colleague,
                comment: `[jira-direct-timer:${state.id}]`}]});
            await p.click('save');
            equal(p.posts().length, 1);
            equal(p.state().phase, 'saved');
            equal(p.state().worklogId, 'mock-2');
        }},
        {title: 'Chyba souctu zustava viditelna, nezameni se za nulu', async run(p) {
            await p.reset({totalError: true});
            equal(p.node('worklog-total').dataset.state, 'error');
            includes(p.node('worklog-total').textContent, 'Simulovana chyba');
            equal(p.node('worklog-total').hidden, false);
            equal(p.posts().length, 0);
        }},
        {title: 'Poskozeny stav se nemaze, zapisove akce jsou blokovane', async run(p) {
            for (const raw of ['{broken', JSON.stringify({issue: 'DEMO-101', phase: 'invalid'})]) {
                await p.reset({raw});
                for (const name of ['start', 'stop', 'save', 'manual']) equal(p.node(name).disabled, true);
                if (!p.node('error').textContent) throw new Error('Missing storage error');
                equal(document.querySelector('#state').textContent, raw);
                equal(p.posts().length, 0);
            }
        }},
        {title: 'Zamek chybi nebo jej drzi jina karta: explicitni chyba bez zapisu', async run(p) {
            for (const lock of ['missing', 'busy']) {
                await p.reset({lock});
                await p.click('start');
                equal(p.state(), null);
                equal(p.posts().length, 0);
                includes(p.node('error').textContent, lock === 'missing' ? 'zamykani' : 'jina karta');
            }
        }},
        {title: 'Storage event z jine karty prekresli panel bez zapisu', async run(p) {
            await p.reset();
            const state = running(p, 'DEMO-102');
            p.externalState(state);
            await p.idle();
            equal(p.state(), state);
            equal(color(p), 'rgb(237, 244, 255)');
            equal(p.node('clock').textContent, '00:02:05');
            equal(p.node('title').textContent, 'Testovaci task: kontrola a opravy');
            equal(p.posts().length, 0);
        }},
        {title: 'Bez otevreneho tasku: nelze START/manual, lze STOP tracked tasku', async run(p) {
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
        {title: 'Oblibene: stitek, hledani, odkaz do nove karty, pridani a odebrani', async run(p) {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Porady a komunikace'}]});
            equal(p.node('fav-count').textContent, '1');
            equal(p.node('favorites').hidden, true);
            await p.click('fav-open');
            equal(p.node('fav-open').hidden, true, 'chip hidden while open');
            const section = p.node('favorites').getBoundingClientRect();
            if (section.bottom > p.node('header').getBoundingClientRect().top + 1) throw new Error('Favorites must sit above the timer header');
            await p.click('fav-add');
            const search = p.node('fav-search');
            equal(document.activeElement, search, 'search focused');
            search.value = 'review';
            search.dispatchEvent(new Event('input'));
            await waitFor(() => p.node('fav-results').querySelectorAll('[data-fav-issue]').length === 2);
            const link = p.node('fav-issue="OPS-140"').querySelector('a');
            equal([link.target, link.rel, link.href], ['_blank', 'noopener noreferrer', 'https://jira.alza.cz/browse/OPS-140']);
            link.click();
            includes(document.querySelector('#link-info').textContent, 'do nove karty');
            equal(search.value, 'review', 'opening a result keeps the search');
            equal(p.favorites().length, 1, 'opening a result does not save it');
            p.node('fav-issue="OPS-140"').querySelector('[data-fav-pin]').click();
            equal(p.favorites().map(value => value.issue), ['OPS-12', 'OPS-140']);
            equal([search.hidden, search.value, p.node('fav-results').hidden], [true, '', true]);
            const added = p.node('fav-list').querySelector('[data-fav-issue="OPS-140"]');
            if (!added.hasAttribute('data-fresh')) throw new Error('New favorite must be highlighted');
            added.querySelector('[data-fav-remove]').click();
            equal(p.favorites().map(value => value.issue), ['OPS-12']);
            equal(p.posts().length, 0);
        }},
        {title: 'Oblibene: START prepne z bezicich stopek a plynule se zavre', async run(p) {
            await p.reset({state: running(p, 'DEMO-102'), favorites: [{issue: 'OPS-12', title: 'Porady a komunikace'}]});
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
        {title: 'Oblibene: +min do vybraneho tasku, limit a poskozeny seznam', async run(p) {
            const state = running(p, 'DEMO-102');
            await p.reset({state, favorites: [{issue: 'OPS-12', title: 'Porady a komunikace'}]});
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
            await p.reset({favorites: Array.from({length: 10}, (_, index) => ({issue: `FULL-${index + 1}`, title: 'Plny seznam'}))});
            await p.click('fav-open');
            await p.click('fav-add');
            equal(p.node('fav-search').disabled, true);
            includes(p.node('fav-error').textContent, 'maximum 10');
            await p.reset({favorites: '{broken'});
            equal(p.node('fav-count').textContent, '!');
            await p.click('fav-open');
            includes(p.node('fav-error').textContent, 'poskozeny');
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
