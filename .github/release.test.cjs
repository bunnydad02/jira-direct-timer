const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const {loadRelease, publishRelease} = require('./release.cjs');

const source = "// ==UserScript==\n// @version      1.16.7\n// ==/UserScript==\nconst VERSION = '1.16.7';\n";
const notes = '# Jira Local Workspace - Worklog timer v1.16.7\n\n## Changes\n\n- Remove the version tooltip.\n';
const repo = {owner: 'example', repo: 'timer'};
const sha = 'tested-main-commit';
const url = 'https://github.com/example/timer/releases/tag/v1.16.7';
const missing = () => Promise.reject(Object.assign(new Error('Not found'), {status: 404}));

function fixture(script = source, body = notes) {
    return loadRelease(file => {
        if (path.basename(file) === 'jira-workspace-timer.user.js') return script;
        assert.equal(path.basename(file), 'v1.16.7.md');
        if (body === null) throw Object.assign(new Error('Missing release notes'), {code: 'ENOENT'});
        return body;
    });
}

function mockGithub(overrides = {}) {
    const calls = [];
    return {
        calls,
        rest: {
            git: {getRef: missing, ...overrides.git},
            repos: {
                getReleaseByTag: missing,
                getContent: async () => ({data: {encoding: 'base64', content: Buffer.from(source).toString('base64')}}),
                createRelease: async payload => {
                    calls.push(payload);
                    return {data: {html_url: url}};
                },
                ...overrides.repos
            }
        }
    };
}

test('current userscript has publishable, versioned release notes', () => {
    assert.match(loadRelease().body, /## Changes/);
});

test('read release metadata and notes, including Windows line endings', () => {
    assert.deepEqual(fixture(), {
        tag: 'v1.16.7', name: 'Jira Local Workspace - Worklog timer v1.16.7',
        body: notes.trim(), source
    });
    assert.equal(fixture(source.replaceAll('\n', '\r\n'), notes.replaceAll('\n', '\r\n')).tag, 'v1.16.7');
});

test('reject missing or mismatched metadata and missing, stale or empty release notes', () => {
    assert.throws(() => fixture(source.replace('@version', '@other')), /three-part/);
    assert.throws(() => fixture(source.replace("VERSION = '1.16.7'", "VERSION = '1.16.6'")), /synchronized/);
    assert.throws(() => fixture(source, null), /Missing release notes/);
    assert.throws(() => fixture(source, notes.replace('v1.16.7', 'v1.16.6')), /current version/);
    assert.throws(() => fixture(source, notes.replace('- Remove the version tooltip.', '')), /Changes section/);
});

test('publish an absent release and tag at the tested commit with authored notes', async () => {
    const github = mockGithub();
    assert.deepEqual(await publishRelease(github, repo, sha, fixture()), {created: true, url});
    assert.deepEqual(github.calls, [{
        ...repo, tag_name: 'v1.16.7', target_commitish: sha,
        name: 'Jira Local Workspace - Worklog timer v1.16.7', body: notes.trim(),
        draft: false, prerelease: false, make_latest: 'legacy'
    }]);
});

test('reruns leave an existing published release untouched', async () => {
    const github = mockGithub({repos: {
        getReleaseByTag: async args => {
            assert.deepEqual(args, {...repo, tag: 'v1.16.7'});
            return {data: {draft: false, prerelease: false, html_url: url}};
        }
    }});
    assert.deepEqual(await publishRelease(github, repo, sha, fixture()), {created: false, url});
    assert.equal(github.calls.length, 0);
});

test('do not silently publish an existing draft or prerelease', async () => {
    for (const flags of [{draft: true, prerelease: false}, {draft: false, prerelease: true}]) {
        const github = mockGithub({repos: {getReleaseByTag: async () => ({data: flags})}});
        await assert.rejects(publishRelease(github, repo, sha, fixture()), /review it manually/);
        assert.equal(github.calls.length, 0);
    }
});

test('backfill a release for an existing tag only when its userscript matches', async () => {
    const github = mockGithub({
        git: {getRef: async args => {
            assert.deepEqual(args, {...repo, ref: 'tags/v1.16.7'});
            return {data: {ref: 'refs/tags/v1.16.7'}};
        }},
        repos: {getContent: async args => {
            assert.deepEqual(args, {...repo, path: 'jira-workspace-timer.user.js', ref: 'refs/tags/v1.16.7'});
            return {data: {encoding: 'base64', content: Buffer.from(source).toString('base64')}};
        }}
    });
    assert.equal((await publishRelease(github, repo, sha, fixture())).created, true);
    assert.equal(github.calls.length, 1);
});

test('reject existing tags with different or unreadable userscript content', async () => {
    for (const file of [
        {encoding: 'base64', content: Buffer.from('different script').toString('base64')},
        {encoding: 'none', content: ''}
    ]) {
        const github = mockGithub({
            git: {getRef: async () => ({data: {}})},
            repos: {getContent: async () => ({data: file})}
        });
        await assert.rejects(publishRelease(github, repo, sha, fixture()), /different userscript|base64/);
        assert.equal(github.calls.length, 0);
    }
});

test('surface API errors without creating a fallback release', async () => {
    const failure = Object.assign(new Error('API unavailable'), {status: 503});
    for (const overrides of [
        {repos: {getReleaseByTag: async () => { throw failure; }}},
        {git: {getRef: async () => { throw failure; }}},
        {git: {getRef: async () => ({data: {}})}, repos: {getContent: missing}},
        {repos: {createRelease: async () => { throw failure; }}}
    ]) {
        const github = mockGithub(overrides);
        await assert.rejects(publishRelease(github, repo, sha, fixture()), /API unavailable|Not found/);
        assert.equal(github.calls.length, 0);
    }
});
