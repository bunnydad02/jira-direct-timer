const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: '*.spec.cjs',
    fullyParallel: true,
    workers: 2,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node tests/server.cjs',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false
    }
});
