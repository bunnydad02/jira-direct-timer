const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const files = new Map([
    ['/', ['playground.html', 'text/html']],
    ['/playground.js', ['playground.js', 'text/javascript']],
    ['/scenarios.js', ['scenarios.js', 'text/javascript']]
]);
const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy',
        "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET') {
        response.writeHead(405).end('Read-only test server');
        return;
    }
    try {
        if (request.url === '/timer-source.js') {
            const source = await fs.readFile(path.join(__dirname, '..', 'jira-workspace-timer.user.js'), 'utf8');
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            response.end(`window.timerSource = ${JSON.stringify(source)};`);
            return;
        }
        const file = files.get(request.url);
        if (!file) {
            response.writeHead(404).end('Not found');
            return;
        }
        const content = await fs.readFile(path.join(__dirname, file[0]));
        response.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
        response.end(content);
    } catch (error) {
        console.error(error);
        response.writeHead(500).end('Unable to load test fixture');
    }
});
server.on('error', error => {
    console.error(error);
    process.exitCode = 1;
});
server.listen(4173, '127.0.0.1', () => {
    console.log('Local timer playground: http://127.0.0.1:4173 (memory only, no Jira access)');
});
