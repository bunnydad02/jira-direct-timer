// ==UserScript==
// @name         Clockify Jira stopwatch – WebSocket fix (stomp -> websockets)
// @namespace    alza.jira-websocket-workaround
// @version      1.1
// @description  Clockify for Jira still returns dead wss://stomp.clockify.me; redirect to wss://websockets.clockify.me
// @match        https://jira.integrations.clockify.me/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// ==/UserScript==

(function () {
    'use strict';

    if (window.__clockifyJiraWebSocketFixInstalled) {
        return;
    }

    window.WebSocket = new Proxy(window.WebSocket, {
        construct(target, args, newTarget) {
            if (args.length > 0) {
                const url = new URL(String(args[0]), window.location.href);
                if (url.protocol === 'wss:' && url.hostname === 'stomp.clockify.me' && !url.port) {
                    url.hostname = 'websockets.clockify.me';
                    args[0] = url.href;
                    // Do not log the URL: its path can contain the user's email.
                    console.info('[Clockify WS fix] Using websockets.clockify.me');
                }
            }
            return Reflect.construct(target, args, newTarget);
        }
    });
    window.__clockifyJiraWebSocketFixInstalled = true;
    console.info('[Clockify WS fix] Installed v1.1 in Clockify frame');
})();
