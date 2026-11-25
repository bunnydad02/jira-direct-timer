const fs = require('node:fs');
const path = require('node:path');
const {test, expect} = require('@playwright/test');

const OUTPUT = path.join(__dirname, '..', 'docs', 'screenshots');
const FIXED_TIME = new Date('2026-01-15T08:00:00Z');
const HIDE_PAGE = 'main {visibility:hidden} #jira-direct-timer [data-version] {visibility:hidden}';
const twoMinutes = 125000;

// Each state is serialized into the page (no closures) and runs with `p = window.playground`.
const groups = [
    {title: 'Timer states', states: [
        {name: 'idle', title: 'Idle (red)', run: async p => { await p.reset(); }},
        {name: 'running', title: 'Tracking the open issue (green)', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
        }},
        {name: 'running-other-issue', title: 'Tracking another issue (blue)', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            p.navigate('DEMO-102');
            await p.idle();
        }},
        {name: 'no-open-issue', title: 'No open issue', run: async p => { await p.reset({issue: ''}); }},
        {name: 'saved-toast', title: 'STOP: saved work log and toast', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            await p.click('stop');
        }},
        {name: 'discarded-toast', title: 'CANCEL: discarded timer and toast', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            await p.click('cancel');
        }},
        {name: 'save-failed', title: 'Save failure: manual retry', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            p.failure('before');
            await p.click('stop');
        }},
        {name: 'save-uncertain', title: 'Lost response: verify marker', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            p.failure('after');
            await p.click('stop');
        }}
    ]},
    {title: 'Work log totals', states: [
        {name: 'totals-with-subtasks', title: 'Personal total including subtasks', run: async p => {
            await p.reset({
                parents: {'DEMO-102': 'DEMO-101', 'DEMO-103': 'DEMO-101'},
                logs: [
                    {issue: 'DEMO-101', timeSpentSeconds: 3600},
                    {issue: 'DEMO-102', timeSpentSeconds: 2700},
                    {issue: 'DEMO-103', timeSpentSeconds: 900}
                ]
            });
        }},
        {name: 'totals-error', title: 'Failed to load totals', run: async p => { await p.reset({totalError: true}); }},
        {name: 'totals-loading', title: 'Loading totals before Jira responds', run: async p => {
            // Not awaited: the screenshot must capture the state before the mocked Jira responds.
            p.reset({latency: 4000});
            await p.sleep(50);
        }}
    ]},
    {title: 'ADD MINUTES and AUTO', states: [
        {name: 'manual-saved', title: 'ADD MINUTES: manual entry of 15 minutes', run: async p => {
            await p.reset();
            await p.manual('15');
        }},
        {name: 'manual-invalid', title: 'ADD MINUTES: invalid value', run: async p => {
            await p.reset();
            await p.manual('-5');
        }},
        {name: 'manual-zero', title: 'ADD MINUTES: zero minutes logs nothing', run: async p => {
            await p.reset();
            await p.manual('0');
        }},
        {name: 'auto-enabled', title: 'AUTO enabled: panel indicator', run: async p => {
            await p.reset({autoSettings: {enabled: true, minutes: 10}});
        }},
        {name: 'auto-settings-error', title: 'AUTO: corrupted settings indicator', run: async p => {
            await p.reset({autoSettings: {enabled: 'yes', minutes: 10}});
        }},
        {name: 'auto-settings', title: 'AUTO: automatic work logging settings', run: async p => {
            await p.reset({autoSettings: {enabled: true, minutes: 10}});
            await p.click('auto-open');
        }},
        {name: 'auto-worklog', title: 'AUTO: work log on Sub-task Bug creation', run: async p => {
            await p.reset({autoSettings: {enabled: true, minutes: 11}});
            await p.createIssue(true);
        }}
    ]},
    {title: 'Favorites', states: [
        {name: 'favorites-chip', title: 'Favorites chip with count', run: async p => {
            await p.reset({favorites: [
                {issue: 'OPS-12', title: 'Meetings and communication'}, {issue: 'DEMO-102', title: 'Test issue: checks and fixes'},
                {issue: 'DEMO-101', title: 'Test issue: implementation'}]});
        }},
        {name: 'favorites-open', title: 'Favorites open above the timer', run: async p => {
            await p.reset({favorites: [
                {issue: 'OPS-12', title: 'Meetings and communication', customTitle: '🗣️ Meetings'}, {issue: 'DEMO-102', title: 'Test issue: checks and fixes'},
                {issue: 'DEMO-101', title: 'Test issue: implementation'}]});
            await p.click('fav-open');
            await p.idle();
        }},
        {name: 'favorites-menu', title: 'Favorite issue menu', run: async p => {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Meetings and communication', customTitle: '🗣️ Meetings'}]});
            await p.click('fav-open');
            await p.idle();
            p.node('fav-menu-toggle').click();
        }},
        {name: 'favorites-rename', title: 'Edit custom name and emoji', run: async p => {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Meetings and communication', customTitle: '🗣️ Meetings'}]});
            await p.click('fav-open');
            await p.idle();
            p.node('fav-menu-toggle').click();
            p.node('fav-rename').click();
        }},
        {name: 'favorites-search', title: 'Search: new-tab link and + adds', run: async p => {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}, {issue: 'ARCH-3', title: 'Architecture review board'}]});
            await p.click('fav-open');
            await p.click('fav-add');
            p.node('fav-search').value = 'review';
            p.node('fav-search').dispatchEvent(new Event('input'));
            while (p.node('fav-results').querySelectorAll('[data-fav-issue]').length < 2) await p.sleep(20);
        }},
        {name: 'favorites-minutes', title: '+min on a favorite issue', run: async p => {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}, {issue: 'DEMO-102', title: 'Test issue: checks and fixes'}]});
            await p.click('fav-open');
            p.node('fav-list').querySelector('[data-fav-minutes]').click();
            p.node('fav-quick').click();
        }},
        {name: 'favorites-running', title: 'Running favorite: stop instead of start', run: async (p, ms) => {
            await p.reset({issue: 'DEMO-101', state: {id: 'shot', issue: 'DEMO-102', started: p.now() - ms, ended: null, phase: 'running'},
                favorites: [{issue: 'OPS-12', title: 'Meetings and communication'}, {issue: 'DEMO-102', title: 'Test issue: checks and fixes'}]});
            await p.click('fav-open');
        }},
        {name: 'favorites-limit', title: 'Full list: search disabled', run: async p => {
            await p.reset({favorites: Array.from({length: 10}, (_, index) => ({issue: `OPS-${index + 1}`, title: 'Recurring meeting'}))});
            await p.click('fav-open');
            await p.click('fav-add');
        }}
    ]},
    {title: 'State protection', states: [
        {name: 'lock-busy', title: 'Lock held by another tab', run: async p => {
            await p.reset({lock: 'busy'});
            p.node('start').click();
            await p.idle();
        }},
        {name: 'corrupted-state', title: 'Corrupted saved state', run: async p => { await p.reset({raw: '{"broken"'}); }}
    ]}
];
const states = groups.flatMap(group => group.states);

test.beforeEach(async ({page}) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === 'http://127.0.0.1:4173' && route.request().method() === 'GET' ? route.continue() : route.abort();
    });
    await page.goto('/');
    await page.evaluate(() => window.playground.ready);
});

for (const state of states) {
    test(state.name, async ({page}) => {
        await page.evaluate(async ([source, ms]) => {
            await (0, eval)(`(${source})`)(window.playground, ms);
        }, [state.run.toString(), twoMinutes]);
        // Playwright's screenshot `style` option is blocked by the playground CSP; inline <style> is allowed.
        await page.evaluate(css => {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }, HIDE_PAGE);
        const box = await page.evaluate(() => {
            const nodes = [document.querySelector('#jira-direct-timer'), ...document.querySelectorAll('#jira-direct-timer [data-toast]')];
            const rects = nodes.map(node => node.getBoundingClientRect());
            return {
                left: Math.min(...rects.map(r => r.left)), top: Math.min(...rects.map(r => r.top)),
                right: Math.max(...rects.map(r => r.right)), bottom: Math.max(...rects.map(r => r.bottom))
            };
        });
        const viewport = page.viewportSize();
        const x = Math.max(0, Math.floor(box.left) - 16);
        const y = Math.max(0, Math.floor(box.top) - 16);
        const clip = {
            x, y,
            width: Math.min(viewport.width, Math.ceil(box.right) + 16) - x,
            height: Math.min(viewport.height, Math.ceil(box.bottom) + 16) - y
        };
        await expect(page).toHaveScreenshot(`${state.name}.png`, {clip});
    });
}

test.afterAll(() => {
    const expected = new Set(states.map(state => `${state.name}.png`));
    fs.mkdirSync(OUTPUT, {recursive: true});
    for (const file of fs.readdirSync(OUTPUT)) {
        if (file.endsWith('.png') && !expected.has(file)) fs.rmSync(path.join(OUTPUT, file));
    }
    const lines = [
        '# Timer screenshots',
        '',
        'Generated by `npm run screenshots` (part of `npm test`) using the local',
        'playground with mocks, fixed time and the version label hidden. Do not edit manually;',
        'add new states to [tests/screenshots.visual.cjs](../../tests/screenshots.visual.cjs).',
        'PR diffs show visual changes; file history and release tags preserve earlier versions.',
        ''
    ];
    for (const group of groups) {
        lines.push(`## ${group.title}`, '', '| State | Screenshot |', '| --- | --- |');
        for (const state of group.states) lines.push(`| ${state.title} (\`${state.name}\`) | ![${state.title}](./${state.name}.png) |`);
        lines.push('');
    }
    fs.writeFileSync(path.join(OUTPUT, 'README.md'), lines.join('\n'));
});
