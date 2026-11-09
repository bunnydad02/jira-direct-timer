const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Releases before this version were published before generated screenshots existed.
const SCREENSHOTS_SINCE = [1, 17, 4];
const SCREENSHOT_LINK = /!\[[^\]\n]*\]\(\.\.\/docs\/screenshots\/([a-z0-9-]+\.png)\)/g;

function requiresScreenshots(version) {
    const parts = version.split('.').map(Number);
    const index = parts.findIndex((part, i) => part !== SCREENSHOTS_SINCE[i]);
    return index === -1 || parts[index] > SCREENSHOTS_SINCE[index];
}

function releaseBody(release, repo) {
    const base = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${release.tag}/docs/screenshots/`;
    return release.body.replace(SCREENSHOT_LINK, (link, file) => link.replace(`../docs/screenshots/${file}`, `${base}${file}`));
}

function loadRelease(readFile = fs.readFileSync, exists = fs.existsSync) {
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
    const screenshots = [...body.matchAll(SCREENSHOT_LINK)].map(match => match[1]);
    if (requiresScreenshots(version)) {
        assert.match(body, /(?:^|\n)## Screenshots\r?\n/, 'Release notes must include a Screenshots section.');
        assert.ok(screenshots.length, 'Release notes must embed relevant images from ../docs/screenshots/.');
    }
    for (const file of screenshots) {
        assert.ok(exists(path.join(root, 'docs', 'screenshots', file)), `Missing release screenshot: docs/screenshots/${file}`);
    }
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
        name: release.name, body: releaseBody(release, repo), draft: false, prerelease: false,
        make_latest: 'legacy'
    });
    return {created: true, url: published.html_url};
}

if (require.main === module) {
    console.log(`Release notes validated: ${loadRelease().tag}`);
}

module.exports = {loadRelease, publishRelease};
