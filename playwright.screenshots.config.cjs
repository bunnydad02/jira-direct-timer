const {defineConfig} = require('@playwright/test');

// Regenerates docs/screenshots; only visually changed images are rewritten.
module.exports = defineConfig({
    testDir: './tests',
    testMatch: 'screenshots.visual.cjs',
    outputDir: './test-results/screenshots',
    snapshotPathTemplate: '{testDir}/../docs/screenshots/{arg}{ext}',
    updateSnapshots: 'changed',
    workers: 1,
    expect: {toHaveScreenshot: {animations: 'disabled', caret: 'hide', scale: 'device'}},
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        viewport: {width: 800, height: 900},
        deviceScaleFactor: 2,
        locale: 'cs-CZ',
        timezoneId: 'Europe/Prague',
        colorScheme: 'light',
        reducedMotion: 'reduce'
    },
    webServer: {
        command: 'node tests/server.cjs',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false
    }
});
