const fs = require('node:fs');
const path = require('node:path');
const {test, expect} = require('@playwright/test');

const OUTPUT = path.join(__dirname, '..', 'docs', 'screenshots');
const FIXED_TIME = new Date('2026-01-15T08:00:00Z');
const HIDE_PAGE = 'main {visibility:hidden} #jira-direct-timer [data-version] {visibility:hidden}';
const twoMinutes = 125000;

// Each state is serialized into the page (no closures) and runs with `p = window.playground`.
const groups = [
    {title: 'Stavy pocitadla', states: [
        {name: 'idle', title: 'Nic se nemeri (cervena)', run: async p => { await p.reset(); }},
        {name: 'running', title: 'Mereni otevreneho tasku (zelena)', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
        }},
        {name: 'running-other-issue', title: 'Mereni jineho tasku (modra)', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            p.navigate('DEMO-102');
            await p.idle();
        }},
        {name: 'no-open-issue', title: 'Stranka bez otevreneho tasku', run: async p => { await p.reset({issue: ''}); }},
        {name: 'saved-toast', title: 'STOP: ulozeny worklog a toast', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            await p.click('stop');
        }},
        {name: 'discarded-toast', title: 'CANCEL: zahozene mereni a toast', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            await p.click('cancel');
        }},
        {name: 'save-failed', title: 'Chyba pred ulozenim: rucni opakovani', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            p.failure('before');
            await p.click('stop');
        }},
        {name: 'save-uncertain', title: 'Ztracena odpoved: overeni markeru', run: async (p, ms) => {
            await p.reset();
            await p.click('start');
            p.advance(ms);
            p.failure('after');
            await p.click('stop');
        }}
    ]},
    {title: 'Soucty worklogu', states: [
        {name: 'totals-with-subtasks', title: 'Vlastni soucet vcetne subtasku', run: async p => {
            await p.reset({
                parents: {'DEMO-102': 'DEMO-101', 'DEMO-103': 'DEMO-101'},
                logs: [
                    {issue: 'DEMO-101', timeSpentSeconds: 3600},
                    {issue: 'DEMO-102', timeSpentSeconds: 2700},
                    {issue: 'DEMO-103', timeSpentSeconds: 900}
                ]
            });
        }},
        {name: 'totals-error', title: 'Chyba nacteni souctu', run: async p => { await p.reset({totalError: true}); }}
    ]},
    {title: 'ADD MINUTES a AUTO', states: [
        {name: 'manual-saved', title: 'ADD MINUTES: rucni zapis 15 minut', run: async p => {
            await p.reset();
            await p.manual('15');
        }},
        {name: 'manual-invalid', title: 'ADD MINUTES: neplatna hodnota', run: async p => {
            await p.reset();
            await p.manual('0');
        }},
        {name: 'auto-enabled', title: 'AUTO zapnuto: indikator v panelu', run: async p => {
            await p.reset({autoSettings: {enabled: true, minutes: 10}});
        }},
        {name: 'auto-settings-error', title: 'AUTO: poskozene nastaveni v panelu', run: async p => {
            await p.reset({autoSettings: {enabled: 'yes', minutes: 10}});
        }},
        {name: 'auto-settings', title: 'AUTO: nastaveni automatickeho vykazovani', run: async p => {
            await p.reset({autoSettings: {enabled: true, minutes: 10}});
            await p.click('auto-open');
        }},
        {name: 'auto-worklog', title: 'AUTO: vykazani pri zalozeni Sub-task Bugu', run: async p => {
            await p.reset({autoSettings: {enabled: true, minutes: 11}});
            await p.createIssue(true);
        }}
    ]},
    {title: 'Oblibene tasky', states: [
        {name: 'favorites-chip', title: 'Stitek oblibene s poctem', run: async p => {
            await p.reset({favorites: [
                {issue: 'OPS-12', title: 'Porady a komunikace'}, {issue: 'DEMO-102', title: 'Testovaci task: kontrola a opravy'},
                {issue: 'DEMO-101', title: 'Testovaci task: implementace'}]});
        }},
        {name: 'favorites-open', title: 'Otevrene oblibene nad stopkami', run: async p => {
            await p.reset({favorites: [
                {issue: 'OPS-12', title: 'Porady a komunikace'}, {issue: 'DEMO-102', title: 'Testovaci task: kontrola a opravy'},
                {issue: 'DEMO-101', title: 'Testovaci task: implementace'}]});
            await p.click('fav-open');
        }},
        {name: 'favorites-search', title: 'Naseptavac: odkaz do nove karty, + prida', run: async p => {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Porady a komunikace'}, {issue: 'ARCH-3', title: 'Architecture review board'}]});
            await p.click('fav-open');
            await p.click('fav-add');
            p.node('fav-search').value = 'review';
            p.node('fav-search').dispatchEvent(new Event('input'));
            while (p.node('fav-results').querySelectorAll('[data-fav-issue]').length < 2) await p.sleep(20);
        }},
        {name: 'favorites-minutes', title: '+min do oblibeneho tasku', run: async p => {
            await p.reset({favorites: [{issue: 'OPS-12', title: 'Porady a komunikace'}, {issue: 'DEMO-102', title: 'Testovaci task: kontrola a opravy'}]});
            await p.click('fav-open');
            p.node('fav-list').querySelector('[data-fav-minutes]').click();
            p.node('fav-quick').click();
        }},
        {name: 'favorites-running', title: 'Bezici oblibeny task: stop misto startu', run: async (p, ms) => {
            await p.reset({issue: 'DEMO-101', state: {id: 'shot', issue: 'DEMO-102', started: p.now() - ms, ended: null, phase: 'running'},
                favorites: [{issue: 'OPS-12', title: 'Porady a komunikace'}, {issue: 'DEMO-102', title: 'Testovaci task: kontrola a opravy'}]});
            await p.click('fav-open');
        }},
        {name: 'favorites-limit', title: 'Plny seznam: hledani je zablokovane', run: async p => {
            await p.reset({favorites: Array.from({length: 10}, (_, index) => ({issue: `OPS-${index + 1}`, title: 'Opakovana schuzka'}))});
            await p.click('fav-open');
            await p.click('fav-add');
        }}
    ]},
    {title: 'Ochrana stavu', states: [
        {name: 'lock-busy', title: 'Zamek drzi jina karta', run: async p => {
            await p.reset({lock: 'busy'});
            p.node('start').click();
            await p.idle();
        }},
        {name: 'corrupted-state', title: 'Poskozeny ulozeny stav', run: async p => { await p.reset({raw: '{"broken"'}); }}
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
        '# Screenshoty stopek',
        '',
        'Generovano prikazem `npm run screenshots` (soucast `npm test`) z lokalniho',
        'playgroundu s mocky, pevnym casem a skrytym cislem verze. Needitovat rucne;',
        'nove stavy pridej do [tests/screenshots.visual.cjs](../../tests/screenshots.visual.cjs).',
        'Zmeny vzhledu ukazuje diff PR, starsi podoby historie souboru a Git tagy vydani.',
        ''
    ];
    for (const group of groups) {
        lines.push(`## ${group.title}`, '', '| Stav | Screenshot |', '| --- | --- |');
        for (const state of group.states) lines.push(`| ${state.title} (\`${state.name}\`) | ![${state.title}](./${state.name}.png) |`);
        lines.push('');
    }
    fs.writeFileSync(path.join(OUTPUT, 'README.md'), lines.join('\n'));
});
