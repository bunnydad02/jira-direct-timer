'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const UPDATE_URL = 'https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-timer.user.js';
// Any change to these privileged metadata lines must be reviewed and then reflected here deliberately.
const EXPECTED_METADATA = {
    match: ['https://jira.alza.cz/*'],
    grant: ['none'],
    updateURL: [UPDATE_URL],
    downloadURL: [UPDATE_URL]
};
const FORBIDDEN_METADATA = ['connect', 'require', 'resource', 'include', 'exclude-match', 'sandbox', 'inject-into'];
const ALLOWED_ABSOLUTE_URLS = [/^https:\/\/jira\.alza\.cz\/browse\/$/, /^https:\/\/github\.com\/bunnydad02\/jira-direct-timer$/];
const FORBIDDEN_CODE = [
    [/\beval\s*\(/, 'eval()'],
    [/\bnew\s+Function\b/, 'new Function'],
    [/\bFunction\s*\(/, 'Function()'],
    [/\b(?:setTimeout|setInterval)\s*\(\s*['"`]/, 'string-evaluating timer'],
    [/\.insertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
    [/\.outerHTML\s*=/, 'outerHTML assignment'],
    [/\bdocument\.write(?:ln)?\s*\(/, 'document.write'],
    [/\.srcdoc\s*=/, 'srcdoc assignment'],
    [/\bcreateContextualFragment\s*\(/, 'createContextualFragment'],
    [/\bimport\s*\(/, 'dynamic import'],
    [/\bpostMessage\s*\(/, 'postMessage'],
    [/\bGM_|\bGM\./, 'Greasemonkey API']
];
const SECRET_PATTERNS = [
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
    [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, 'GitHub fine-grained token'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
    [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 'private key'],
    [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
    [/\bATATT3[A-Za-z0-9_=-]{20,}\b/, 'Atlassian API token'],
    [/\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/, 'bearer credential'],
    [/https?:\/\/[^\s/:@'"`]+:[^\s/@'"`]+@/, 'credentials in URL']
];

function metadataOf(source) {
    const match = /^\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m.exec(source);
    if (!match) throw new Error('Userscript metadata block is missing.');
    const values = {};
    for (const line of match[1].split(/\r?\n/)) {
        const entry = /^\/\/ @(\S+)\s+(.*?)\s*$/.exec(line);
        if (entry) (values[entry[1]] ||= []).push(entry[2]);
    }
    return {values, body: source.slice(match.index + match[0].length)};
}

function stripComments(code) {
    return code.replace(/^\s*\/\/.*$/gm, '');
}

function auditUserscript(source) {
    const problems = [];
    const {values, body} = metadataOf(source);
    for (const [key, expected] of Object.entries(EXPECTED_METADATA)) {
        if (JSON.stringify(values[key] || []) !== JSON.stringify(expected)) {
            problems.push(`@${key} must be ${expected.join(', ')}; found ${(values[key] || ['(missing)']).join(', ')}`);
        }
    }
    for (const key of FORBIDDEN_METADATA) {
        if (values[key]) problems.push(`@${key} is not allowed`);
    }
    const code = stripComments(body);
    for (const [pattern, label] of FORBIDDEN_CODE) {
        if (pattern.test(code)) problems.push(`forbidden construct: ${label}`);
    }
    for (const assignment of code.matchAll(/\.innerHTML\s*(\+?=)\s*([^;]*);/g)) {
        if (assignment[1] !== '=' || !/^'[^'\\\n]*'$/.test(assignment[2].trim())) {
            problems.push(`innerHTML may only be assigned a single static string literal: ${assignment[0].slice(0, 80)}`);
        }
    }
    const fetchCalls = code.match(/\bfetch\s*\(/g) || [];
    const requestFetch = code.match(/\bwindow\.fetch\(path, \{/g) || [];
    if (fetchCalls.length !== 1 || requestFetch.length !== 1) {
        problems.push('fetch() may only be called once, inside request(path, ...)');
    }
    for (const call of code.matchAll(/(?<!function |\.)\brequest\(\s*([^,)]*)/g)) {
        if (!/^['`]\/[^/]/.test(call[1].trim())) problems.push(`request() must use a same-origin relative path: ${call[0]}`);
    }
    for (const url of code.matchAll(/\b(?:https?|wss?):\/\/[^\s'"`$)]*/g)) {
        if (!ALLOWED_ABSOLUTE_URLS.some(pattern => pattern.test(url[0]))) problems.push(`unexpected absolute URL: ${url[0]}`);
    }
    if (/\bXMLHttpRequest\s*\(/.test(code)) problems.push('new XMLHttpRequest requests are not allowed; use request()');
    return problems;
}

function scanSecrets(files) {
    const problems = [];
    for (const [name, text] of files) {
        text.split(/\r?\n/).forEach((line, index) => {
            for (const [pattern, label] of SECRET_PATTERNS) {
                if (pattern.test(line)) problems.push(`${name}:${index + 1}: possible ${label}`);
            }
        });
    }
    return problems;
}

function auditWorkflows(files) {
    const problems = [];
    for (const [name, text] of files) {
        text.split(/\r?\n/).forEach((line, index) => {
            const use = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/.exec(line);
            if (use && !use[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(use[1])) {
                problems.push(`${name}:${index + 1}: action must be pinned to a full commit SHA: ${use[1]}`);
            }
        });
    }
    return problems;
}

function trackedTextFiles() {
    const names = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
    return names.filter(name => name !== 'package-lock.json' && name !== '.github/security-audit.test.cjs').flatMap(name => {
        const buffer = fs.readFileSync(path.join(root, name));
        return buffer.includes(0) ? [] : [[name, buffer.toString('utf8')]];
    });
}

if (require.main === module) {
    const source = fs.readFileSync(path.join(root, 'jira-workspace-timer.user.js'), 'utf8');
    const files = trackedTextFiles();
    const workflows = files.filter(([name]) => /^\.github\/workflows\/.+\.ya?ml$/.test(name));
    const problems = [...auditUserscript(source), ...auditWorkflows(workflows), ...scanSecrets(files)];
    if (problems.length) {
        console.error(`Security audit failed:\n- ${problems.join('\n- ')}`);
        process.exitCode = 1;
    } else {
        console.log('PASS: security audit (userscript metadata, dangerous constructs, network targets, pinned actions, secrets)');
    }
}

module.exports = {auditUserscript, auditWorkflows, scanSecrets};
