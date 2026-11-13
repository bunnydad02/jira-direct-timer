const {test, expect} = require('@playwright/test');
const {scenarios} = require('./scenarios.js');

for (const [index, scenario] of scenarios.entries()) {
    test(scenario.title, async ({page}) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => {
            errors.push(`Unexpected dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== 'http://127.0.0.1:4173' || route.request().method() !== 'GET') {
                errors.push(`Unexpected network access: ${route.request().method()} ${url}`);
                return route.abort();
            }
            return route.continue();
        });
        await page.goto('/');
        await page.evaluate(index => window.regression.run(index), index);
        expect(errors).toEqual([]);
    });
}

test('Interactive suite reports every scenario and can be rerun', async ({page}) => {
    test.setTimeout(120000);
    await page.goto('/');
    for (let run = 0; run < 2; run++) {
        await page.getByRole('button', {name: 'Spustit vsechny regresni scenare'}).click();
        await expect(page.locator('#test-status')).toHaveText(`Hotovo: ${scenarios.length} OK, 0 chyb.`, {timeout: 55000});
        await expect(page.locator('#results li[data-result="passed"]')).toHaveCount(scenarios.length);
        await expect(page.locator('#run')).toBeEnabled();
    }
    await page.getByRole('button', {name: 'Vynulovat simulaci'}).click();
    await expect(page.locator('[data-clock]')).toHaveText('00:00:00');
    await expect(page.locator('[data-start]')).toBeEnabled();
});

test('Real controls navigate, advance, reload, fail and recover locally', async ({page}) => {
    await page.goto('/');
    await page.locator('[data-start]').click();
    await page.locator('#advance').click();
    await expect(page.locator('[data-clock]')).toHaveText('00:02:05');
    await page.locator('#issue').selectOption('DEMO-102');
    await expect(page.locator('#jira-direct-timer')).toHaveAttribute('data-other', 'true');
    await page.locator('[data-title]').click();
    await expect(page.locator('#issue')).toHaveValue('DEMO-101');
    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await page.locator('[data-version]').click();
    await expect(page.locator('#link-info')).toContainText('https://github.com/bunnydad02/jira-direct-timer');
    await page.locator('#failure').selectOption('after');
    await page.locator('[data-stop]').click();
    await expect(page.locator('[data-save]')).toBeVisible();
    await expect(page.locator('[data-error]')).toContainText('Simulovana ztrata odpovedi');
    await page.locator('#reload').click();
    await page.locator('[data-save]').click();
    await expect(page.locator('[data-toast="saved"]')).toBeVisible();
    expect(await page.evaluate(() => window.playground.posts().length)).toBe(1);
});

test('Unchanged renders do not mutate the DOM', async ({page}) => {
    await page.goto('/');
    const mutations = await page.evaluate(async () => {
        const {playground} = window;
        await playground.ready;
        const count = async (options, prepare = async () => {}) => {
            await playground.reset(options);
            await prepare();
            playground.advance(0);
            const panel = playground.panel();
            const observer = new MutationObserver(() => {});
            observer.observe(panel, {subtree: true, childList: true, attributes: true, characterData: true});
            for (let i = 0; i < 20; i++) playground.advance(0);
            const records = observer.takeRecords().filter(record => !panel.querySelector('[data-clock]').contains(record.target));
            observer.disconnect();
            return records.map(record => `${record.type}:${record.attributeName || ''}:${record.target.nodeName}`);
        };
        const started = playground.now() - 65000;
        return {
            idle: await count({}),
            running: await count({state: {id: 'r', issue: 'DEMO-101', started, ended: null, phase: 'running'}}),
            other: await count({issue: 'DEMO-102', state: {id: 'o', issue: 'DEMO-101', started, ended: null, phase: 'running'}}),
            corrupted: await count({raw: '{broken'}),
            favorites: await count({favorites: [{issue: 'DEMO-101', title: 'A'}, {issue: 'OPS-12', title: 'B'}],
                state: {id: 'f', issue: 'DEMO-101', started, ended: null, phase: 'running'}},
            async () => { playground.node('fav-open').click(); await playground.idle(); })
        };
    });
    expect(mutations).toEqual({idle: [], running: [], other: [], corrupted: [], favorites: []});
});

test('Safety: actual storage untouched, network blocked, server rejects writes', async ({page, request}) => {
    await page.addInitScript(() => localStorage.setItem('jira-direct-timer-v1', 'untouched sentinel'));
    await page.goto('/');
    await page.evaluate(async () => {
        await window.playground.ready;
        await window.playground.click('start');
        await window.playground.click('stop');
    });
    expect(await page.evaluate(() => localStorage.getItem('jira-direct-timer-v1'))).toBe('untouched sentinel');
    expect(await page.evaluate(async () => {
        try {
            await fetch('/rest/api/2/issue/DEMO-101/worklog', {method: 'POST', body: '{}'});
            return 'unexpected success';
        } catch (error) {
            return error.name;
        }
    })).toBe('TypeError');
    const response = await request.post('/rest/api/2/issue/DEMO-101/worklog', {data: {}});
    expect(response.status()).toBe(405);
    expect((await request.get('/')).headers()['content-security-policy']).toContain("connect-src 'none'");
});
