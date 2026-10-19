const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'jira-workspace-issue.user.js'), 'utf8');
const KEY = 'jira-local-workspace-ui-v1';

function setup({stored = null, brokenRead = false, brokenWrite = false, pathname = '/browse/DEMO-42', search = '', frame = false, issue = true} = {}) {
    const listeners = {};
    const frames = [];
    const errors = [];
    const writes = [];
    const reads = [];
    let observer;
    let observations;
    class Element {
        constructor(tag = 'div', id = '') {
            this.tag = tag;
            this.id = id;
            this.nodeType = 1;
            this.children = [];
            this.attributes = {};
            this.textContent = '';
            this.hidden = false;
        }
        appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
        before(child) {
            child.remove();
            child.parentElement = this.parentElement;
            this.parentElement.children.splice(this.parentElement.children.indexOf(this), 0, child);
        }
        remove() {
            if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
            this.parentElement = null;
        }
        replaceChildren() { for (const child of [...this.children]) child.remove(); }
        get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
        setAttribute(name, value) { this.attributes[name] = value; }
        removeAttribute(name) { delete this.attributes[name]; }
        closest(selector) {
            const ids = selector.split(',').map(part => part.trim().slice(1));
            return ids.includes(this.id) ? this : this.parentElement?.closest(selector) || null;
        }
        querySelector(selector) {
            const match = node => selector.startsWith('#') ? node.id === selector.slice(1) :
                selector === 'nav' ? node.tag === 'nav' :
                selector === '.mod-header h2, .mod-header h3' ? node.tag === 'h2' :
                node.attributes[selector.slice(1, -1)] !== undefined;
            for (const child of this.children) {
                if (match(child)) return child;
                const nested = child.querySelector(selector);
                if (nested) return nested;
            }
            return null;
        }
        set innerHTML(value) {
            this.html = value;
            for (const tag of ['nav', 'data-density', 'data-toggle', 'data-error']) {
                const node = new Element(tag === 'nav' ? tag : 'button');
                if (tag !== 'nav') node.setAttribute(tag, '');
                this.appendChild(node);
            }
        }
        scrollIntoView(options) { this.scrolled = options; }
    }
    const head = new Element('head');
    const body = new Element('body');
    const html = new Element('html');
    html.appendChild(head);
    html.appendChild(body);
    function makeIssue(id = 'issue-content') {
        const root = new Element('div', id);
        const summary = new Element('h1', 'summary-val');
        summary.textContent = 'Modern issue <safe text>';
        root.appendChild(summary);
        const description = new Element('section', 'descriptionmodule');
        const heading = new Element('h2');
        heading.textContent = 'Description <safe text>';
        description.appendChild(heading);
        root.appendChild(description);
        body.appendChild(root);
        return root;
    }
    let root = issue ? makeIssue() : null;
    const location = {pathname, search};
    const window = {addEventListener: (name, callback) => { listeners[name] = callback; }};
    window.top = frame ? {} : window;
    const context = {
        window, location, URLSearchParams,
        document: {head, body, documentElement: html,
            createElement: tag => new Element(tag),
            getElementById: id => html.querySelector(`#${id}`),
            querySelector: selector => html.querySelector(selector)},
        localStorage: {
            getItem(key) { reads.push(key); if (brokenRead) throw new Error('Read denied'); return stored; },
            setItem(key, value) { if (brokenWrite) throw new Error('Quota exceeded'); writes.push({key, value}); stored = value; }
        },
        console: {error: (...args) => errors.push(args)},
        MutationObserver: class {
            constructor(callback) { observer = callback; }
            observe(target, options) { observations = {target, options}; }
        },
        requestAnimationFrame: callback => frames.push(callback)
    };
    vm.runInNewContext(source, context);
    return {html, head, body, root, reads, writes, errors, location, listeners, observations,
        makeIssue, Element,
        toolbar: () => html.querySelector('#jira-local-workspace-toolbar'),
        button: selector => html.querySelector(selector),
        execute: () => vm.runInNewContext(source, context),
        flush: () => { while (frames.length) frames.shift()(); },
        frames,
        mutate(target, addedNodes = [], removedNodes = [], type = 'childList') {
            observer([{target, addedNodes, removedNodes, type}]);
        },
        external(value, key = KEY) { stored = value; listeners.storage({key}); }
    };
}

const h = setup();
assert.equal(h.html.attributes['data-jlw'], 'on');
assert.equal(h.html.attributes['data-jlw-density'], 'compact', 'compact is the default, not an optional fix for a spacious theme');
assert.equal(h.toolbar().nextElementSibling, h.root);
assert.equal(h.toolbar().querySelector('nav').children[0].textContent, 'Description <safe text>');
assert.equal(h.root.querySelector('#summary-val').textContent, 'Modern issue <safe text>');
assert.equal(h.writes.length, 0, 'do not write defaults during startup');
assert.deepEqual(h.reads, [KEY], 'never access timer storage');
assert.equal(h.observations.target, h.body);
assert.equal(h.observations.options.subtree, true);
const toggle = h.button('[data-toggle]');
const density = h.button('[data-density]');
density.onclick();
assert.equal(h.html.attributes['data-jlw-density'], 'comfortable');
assert.equal(density.attributes['aria-pressed'], 'false');
assert.deepEqual(JSON.parse(h.writes[0].value), {enabled: true, compact: false});
toggle.onclick();
assert.equal(h.html.attributes['data-jlw'], undefined);
assert.equal(h.html.attributes['data-jlw-density'], undefined);
assert.equal(toggle.textContent, 'Novy vzhled');
assert.equal(toggle.attributes['aria-pressed'], 'false');
assert.equal(density.disabled, true);
assert.ok(h.toolbar(), 'keep native-view toggle reachable');
toggle.onclick();
assert.equal(h.html.attributes['data-jlw-density'], 'comfortable');
assert.equal(h.writes.every(write => write.key === KEY), true);
let prevented = false;
h.toolbar().querySelector('nav').children[0].onclick({preventDefault() { prevented = true; }});
assert.ok(prevented, 'section navigation must not alter the Jira route/hash');
assert.equal(h.root.querySelector('#descriptionmodule').scrolled.block, 'start');
h.execute();
assert.equal(h.head.children.length, 1, 'do not initialize twice');

const timer = new h.Element('section', 'jira-direct-timer');
h.body.appendChild(timer);
h.mutate(timer, [new h.Element()]);
h.mutate(h.body, [timer]);
h.mutate(h.toolbar(), [new h.Element()]);
assert.equal(h.frames.length, 0, 'ignore timer/toast and own toolbar mutations');
h.mutate(h.body, [new h.Element()]);
h.mutate(h.body, [new h.Element()]);
assert.equal(h.frames.length, 1, 'coalesce Jira changes');
h.flush();
const oldLink = h.toolbar().querySelector('nav').children[0];
h.mutate(h.root, [new h.Element()]);
h.flush();
assert.equal(h.toolbar().querySelector('nav').children[0], oldLink, 'preserve focused links on unrelated Jira changes');
const activity = new h.Element('section', 'activitymodule');
h.root.appendChild(activity);
h.mutate(h.root, [activity]);
h.flush();
assert.equal(h.toolbar().querySelector('nav').children.length, 2);
assert.equal(h.toolbar().querySelector('nav').children[1].textContent, 'Aktivita');
const heading = h.root.querySelector('#descriptionmodule').children[0];
heading.textContent = 'Renamed section';
h.mutate(heading, [], [], 'characterData');
h.flush();
assert.equal(h.toolbar().querySelector('nav').children[0].textContent, 'Renamed section');

const oldRoot = h.root;
oldRoot.remove();
const replacement = h.makeIssue('issue-view');
h.mutate(h.body, [replacement], [oldRoot]);
h.flush();
assert.equal(h.toolbar().nextElementSibling, replacement);
assert.equal(h.toolbar().querySelector('nav').children.length, 1);
h.location.pathname = '/issues/';
h.listeners.popstate();
h.flush();
assert.equal(h.html.attributes['data-jlw'], undefined);
assert.equal(h.toolbar(), null);
h.location.search = '?selectedIssue=DEMO-99';
h.listeners.popstate();
h.flush();
assert.equal(h.html.attributes['data-jlw'], 'on');
h.external('{"enabled":false,"compact":false}');
assert.equal(h.html.attributes['data-jlw'], undefined);
h.external(null, null);
assert.equal(h.html.attributes['data-jlw'], 'on', 'handle storage.clear from another tab');
const originalReads = h.reads.length;
h.external(null, 'jira-direct-timer-v1');
assert.equal(h.reads.length, originalReads, 'ignore unrelated storage events');

for (const options of [{pathname: '/secure/Dashboard.jspa'}, {pathname: '/issues/', search: '?selectedIssue=bad'}, {issue: false}, {frame: true}]) {
    const outside = setup(options);
    assert.equal(outside.html.attributes['data-jlw'], undefined);
    assert.equal(outside.toolbar(), null);
}
const late = setup({issue: false});
const lateRoot = late.makeIssue();
late.mutate(late.body, [lateRoot]);
late.flush();
assert.equal(late.html.attributes['data-jlw'], 'on', 'support a late-loaded issue');
const empty = setup();
empty.root.querySelector('#summary-val').textContent = ' ';
empty.listeners.pageshow();
empty.flush();
assert.equal(empty.toolbar(), null, 'do not style incomplete issue loads');
const persisted = setup({stored: '{"enabled":false,"compact":true}'});
assert.equal(persisted.html.attributes['data-jlw'], undefined);
assert.equal(persisted.button('[data-toggle]').textContent, 'Novy vzhled');
for (const options of [{stored: '{bad'}, {stored: '{"enabled":"yes","compact":false}'}, {brokenRead: true}, {brokenWrite: true}]) {
    const failure = setup(options);
    failure.button('[data-density]').onclick();
    assert.equal(failure.errors.length, 1);
    assert.match(failure.button('[data-error]').textContent, /nelze ulozit nebo nacist/);
    assert.equal(failure.button('[data-error]').hidden, false);
    assert.equal(failure.html.attributes['data-jlw-density'], 'comfortable', 'settings still work in memory after a storage error');
    assert.equal(failure.writes.length, 0, 'never overwrite malformed/unreadable preferences');
}
console.log('PASS: issue detection, reversible styling, density, safe section labels, navigation, storage isolation/errors, cross-tab preferences, dynamic replacement, late loading and observer coalescing');
