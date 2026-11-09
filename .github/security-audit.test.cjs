const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {auditUserscript, auditWorkflows, scanSecrets} = require('./security-audit.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'jira-workspace-timer.user.js'), 'utf8');
const mutate = (from, to) => {
    assert.ok(source.includes(from), `fixture anchor missing: ${from}`);
    return source.replace(from, to);
};

test('current userscript passes the audit', () => {
    assert.deepEqual(auditUserscript(source), []);
});

test('privileged metadata changes are reported', () => {
    for (const [from, to, expected] of [
        ['// @grant        none', '// @grant        GM_xmlhttpRequest', /@grant/],
        ['// @match        https://jira.alza.cz/*', '// @match        https://*/*', /@match/],
        ['// @run-at', '// @connect      evil.example\n// @run-at', /@connect/],
        ['// @run-at', '// @require      https://cdn.example/x.js\n// @run-at', /@require/],
        ['// @downloadURL  https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/', '// @downloadURL  https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/other/', /@downloadURL/]
    ]) {
        assert.match(auditUserscript(mutate(from, to)).join('\n'), expected);
    }
});

test('dynamic HTML, code evaluation and foreign network targets are reported', () => {
    const body = "'use strict';";
    for (const [snippet, expected] of [
        ['panel.innerHTML = `<b>${value.issue}</b>`;', /innerHTML/],
        ["panel.innerHTML = '<b>' + title;", /innerHTML/],
        ['panel.insertAdjacentHTML("beforeend", title);', /insertAdjacentHTML/],
        ['eval(text);', /eval/],
        ['new Function(text)();', /new Function/],
        ["setTimeout('run()', 5);", /timer/],
        ["request('https://evil.example/rest/api/2/myself');", /request\(\)/],
        ["fetch('/rest/api/2/myself');", /fetch\(\)/],
        ["const target = 'https://evil.example/collect';", /absolute URL/]
    ]) {
        assert.match(auditUserscript(mutate(body, `${body}\n    ${snippet}`)).join('\n'), expected, snippet);
    }
});

test('workflow actions must be pinned to a full commit SHA', () => {
    const sha = 'a'.repeat(40);
    assert.deepEqual(auditWorkflows([['ci.yml', [
        `      - uses: actions/checkout@${sha} # v4.4.0`,
        '      - uses: ./.github/actions/local',
        '      - uses: actions/setup-node@v4',
        `        uses: actions/cache@${sha.slice(1)}`
    ].join('\n')]]), [
        'ci.yml:3: action must be pinned to a full commit SHA: actions/setup-node@v4',
        `ci.yml:4: action must be pinned to a full commit SHA: actions/cache@${sha.slice(1)}`
    ]);
});

test('obvious secrets are reported with their location', () => {
    const token = ['ghp', '_', 'a'.repeat(36)].join('');
    assert.deepEqual(scanSecrets([['notes.md', `ok\nurl https://user:${'p'.repeat(8)}@jira.example\n${token}`]]),
        ['notes.md:2: possible credentials in URL', 'notes.md:3: possible GitHub token']);
    assert.deepEqual(scanSecrets([['README.md', 'Nikdy nevkladej token do skriptu ani URL.']]), []);
});
