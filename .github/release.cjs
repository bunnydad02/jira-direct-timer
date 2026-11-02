const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function loadRelease(readFile = fs.readFileSync) {
    const root = path.join(__dirname, '..');
    const source = readFile(path.join(root, 'jira-workspace-timer.user.js'), 'utf8');
    const version = source.split('// ==/UserScript==')[0].match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
    assert.ok(version, 'Publish a three-part userscript version.');
    assert.equal(source.match(/const VERSION = '(\d+\.\d+\.\d+)';/)?.[1], version,
        'Keep the displayed version synchronized with userscript metadata.');
    const tag = `v${version}`;
    const name = `Jira Local Workspace - Worklog timer ${tag}`;
    const body = readFile(path.join(root, 'releases', `${tag}.md`), 'utf8').trim();
    assert.equal(body.split(/\r?\n/)[0], `# ${name}`, 'Release notes must identify the current version.');
    assert.match(body, /(?:^|\n)## Changes\r?\n(?:\r?\n)*- \S+/,
        'Release notes must include a Changes section with user-facing changes.');
    return {tag, name, body, source};
}

async function findOrNull(request) {
    try {
        return (await request()).data;
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

async function publishRelease(github, repo, sha, release) {
    const existing = await findOrNull(() =>
        github.rest.repos.getReleaseByTag({...repo, tag: release.tag}));
    if (existing) {
        assert.ok(!existing.draft && !existing.prerelease,
            `Release ${release.tag} already exists as a draft or prerelease; review it manually.`);
        return {created: false, url: existing.html_url};
    }

    const tag = await findOrNull(() =>
        github.rest.git.getRef({...repo, ref: `tags/${release.tag}`}));
    if (tag) {
        const {data: file} = await github.rest.repos.getContent({
            ...repo, path: 'jira-workspace-timer.user.js', ref: `refs/tags/${release.tag}`
        });
        assert.equal(file.encoding, 'base64', 'Expected the tagged userscript as base64 file content.');
        assert.equal(Buffer.from(file.content, 'base64').toString('utf8'), release.source,
            `Existing tag ${release.tag} points to a different userscript; do not move or release it.`);
    }

    const {data: published} = await github.rest.repos.createRelease({
        ...repo, tag_name: release.tag, target_commitish: sha,
        name: release.name, body: release.body, draft: false, prerelease: false,
        make_latest: 'legacy'
    });
    return {created: true, url: published.html_url};
}

if (require.main === module) {
    console.log(`Release notes validated: ${loadRelease().tag}`);
}

module.exports = {loadRelease, publishRelease};
