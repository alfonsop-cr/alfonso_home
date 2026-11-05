import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const SeenGist = require('./seen-gist.js');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const GIST = SeenGist.SEEN_GIST_ID;
const API = SeenGist.SEEN_GIST_API;
const RAW = 'https://gist.githubusercontent.com/alfonsop-cr/' + GIST + '/raw/abc/seen.json';
const TOKEN = 'test-token-not-a-secret';

function tabs(partial) {
    const base = {
        cr: { showVistas: false, titulos: [], urls: [] },
        ai: { showVistas: false, titulos: [], urls: [] },
        us: { showVistas: false, titulos: [], urls: [] },
        world: { showVistas: false, titulos: [], urls: [] }
    };
    Object.keys(partial || {}).forEach(function (id) {
        base[id] = Object.assign({}, base[id], partial[id]);
    });
    return base;
}

function remoteJson(partial) {
    const body = { cr: { titulos: [], urls: [] }, ai: { titulos: [], urls: [] }, us: { titulos: [], urls: [] }, world: { titulos: [], urls: [] } };
    Object.keys(partial || {}).forEach(function (id) {
        body[id] = partial[id];
    });
    return JSON.stringify(body);
}

function jsonResponse(status, obj) {
    return {
        status: status,
        ok: status >= 200 && status < 300,
        json: async function () { return obj; },
        text: async function () { return JSON.stringify(obj); }
    };
}

function textResponse(status, text) {
    return {
        status: status,
        ok: status >= 200 && status < 300,
        json: async function () { throw new Error('not json'); },
        text: async function () { return text; }
    };
}

function mockFetch(routes) {
    const calls = [];
    async function fetchImpl(url, init) {
        calls.push({ url: url, init: init || {} });
        const route = routes.find(function (r) { return r.match(url, init || {}); });
        if (!route) throw new Error('unexpected fetch ' + url);
        return route.respond(url, init || {});
    }
    return { fetchImpl: fetchImpl, calls: calls };
}

function patches(calls) {
    return calls.filter(function (c) { return c.init.method === 'PATCH'; });
}

function patchContent(call) {
    const body = JSON.parse(call.init.body);
    return JSON.parse(body.files['seen.json'].content);
}

function assertNoAuthLeak(calls) {
    calls.forEach(function (c) {
        const host = new URL(c.url).hostname;
        const auth = c.init.headers && c.init.headers.Authorization;
        if (host !== 'api.github.com') assert.equal(auth, undefined, 'auth leaked to ' + host);
        assert.equal(c.init.redirect, 'error');
        assert.equal(c.init.credentials, 'omit');
        assert.equal(String(c.url).includes(TOKEN), false);
    });
}

const fullRemote = remoteJson({
    cr: {
        titulos: ['Patricia Solano fixture', 'otro'],
        urls: ['https://example.test/solano']
    }
});

async function run() {
    assert.equal(SeenGist.isAllowedSeenGistUrl(API), true);
    assert.equal(SeenGist.isAllowedSeenGistUrl(RAW), true);
    assert.equal(SeenGist.isAllowedSeenGistUrl('http://api.github.com/gists/' + GIST), false);
    assert.equal(SeenGist.isAllowedSeenGistUrl('https://user:pw@api.github.com/gists/' + GIST), false);
    assert.equal(SeenGist.isAllowedSeenGistUrl('https://api.github.com.evil.test/gists/' + GIST), false);
    assert.equal(SeenGist.isAllowedSeenGistUrl('https://evil.test/gists/' + GIST), false);
    assert.equal(SeenGist.isAllowedSeenGistUrl('https://gist.githubusercontent.com/alfonsop-cr/deadbeef/raw/abc/seen.json'), false);
    assert.equal(SeenGist.isAllowedSeenGistUrl('https://gist.githubusercontent.com/alfonsop-cr/' + GIST + '/raw/../../../../@evil.test/x'), false);
    assert.throws(() => SeenGist.headersForSeenUrl(TOKEN, 'https://evil.test/steal'), /bad-url/);
    const rawHeaders = SeenGist.headersForSeenUrl(TOKEN, RAW);
    assert.equal(rawHeaders.Authorization, undefined);
    assert.equal(SeenGist.headersForSeenUrl(TOKEN, API).Authorization, 'Bearer ' + TOKEN);

    assert.throws(() => SeenGist.parseGistSeen('{"cr":'), /bad-json/);
    assert.throws(() => SeenGist.parseGistSeen(''), /bad-json/);
    assert.throws(() => SeenGist.parseGistSeen('[]'), /bad-json/);
    assert.throws(() => SeenGist.parseGistSeen('null'), /bad-json/);
    const parsed = SeenGist.parseGistSeen(fullRemote);
    assert.deepEqual(parsed.cr.titulos, ['Patricia Solano fixture', 'otro']);

    const local = tabs({
        cr: { showVistas: true, titulos: ['marca local'], urls: ['https://example.test/local'] }
    });
    const localTitulos = local.cr.titulos;

    /* truncated:true, content is not the file, raw has the real JSON */
    {
        const truncatedPrefix = fullRemote.slice(0, 40);
        assert.throws(() => JSON.parse(truncatedPrefix));
        const { fetchImpl, calls } = mockFetch([
            {
                match: function (url, init) { return url === API && init.method === 'GET'; },
                respond: function () {
                    return jsonResponse(200, {
                        files: {
                            'seen.json': {
                                filename: 'seen.json',
                                truncated: true,
                                size: 974730,
                                content: truncatedPrefix,
                                raw_url: RAW
                            }
                        }
                    });
                }
            },
            {
                match: function (url) { return url === RAW; },
                respond: function () { return textResponse(200, fullRemote); }
            },
            {
                match: function (url, init) { return url === API && init.method === 'PATCH'; },
                respond: function () { return jsonResponse(200, {}); }
            }
        ]);
        const result = await SeenGist.exchangeSeenLists(local, TOKEN, 'sync', fetchImpl);
        assert.equal(result.synced, true);
        assert.equal(result.didPatch, true);
        assert.equal(local.cr.titulos, localTitulos);
        assert.deepEqual(local.cr.titulos, ['marca local']);
        assert.equal(result.local.cr.showVistas, true);
        assert.deepEqual(result.local.cr.titulos, ['marca local', 'Patricia Solano fixture', 'otro']);
        assert.deepEqual(result.local.cr.urls, ['https://example.test/local', 'https://example.test/solano']);
        const wrote = patches(calls);
        assert.equal(wrote.length, 1);
        const saved = patchContent(wrote[0]);
        assert.deepEqual(saved.cr.titulos, ['marca local', 'Patricia Solano fixture', 'otro']);
        assert.equal(JSON.stringify(saved).includes(truncatedPrefix), false);
        assert.equal(calls.some(function (c) { return c.url === RAW; }), true);
        assert.equal(calls.find(function (c) { return c.url === RAW; }).init.headers.Authorization, undefined);
        assertNoAuthLeak(calls);
    }

    /* truncated content happens to be valid JSON; raw still wins */
    {
        const decoy = remoteJson({ cr: { titulos: ['solo-truncado'], urls: [] } });
        const real = remoteJson({ cr: { titulos: ['completo'], urls: ['https://example.test/completo'] } });
        const { fetchImpl, calls } = mockFetch([
            {
                match: function (url, init) { return url === API && init.method === 'GET'; },
                respond: function () {
                    return jsonResponse(200, {
                        files: { 'seen.json': { truncated: true, size: 974730, content: decoy, raw_url: RAW } }
                    });
                }
            },
            {
                match: function (url) { return url === RAW; },
                respond: function () { return textResponse(200, real); }
            },
            {
                match: function (url, init) { return url === API && init.method === 'PATCH'; },
                respond: function () { return jsonResponse(200, {}); }
            }
        ]);
        const result = await SeenGist.exchangeSeenLists(tabs(), TOKEN, 'force', fetchImpl);
        assert.equal(result.synced, true);
        assert.deepEqual(patchContent(patches(calls)[0]).cr.titulos, ['completo']);
        assert.equal(patchContent(patches(calls)[0]).cr.titulos.includes('solo-truncado'), false);
    }

    async function assertPreserved(label, routes, mode) {
        const input = tabs({
            cr: { showVistas: true, titulos: ['queda'], urls: ['https://example.test/queda'] }
        });
        const before = JSON.stringify(input);
        const { fetchImpl, calls } = mockFetch(routes);
        const result = await SeenGist.exchangeSeenLists(input, TOKEN, mode || 'force', fetchImpl);
        assert.equal(result.ok, false, label);
        assert.equal(result.synced, false, label);
        assert.equal(result.didPatch, false, label);
        assert.equal(patches(calls).length, 0, label);
        assert.equal(JSON.stringify(input), before, label);
        calls.forEach(function (c) {
            const host = new URL(c.url).hostname;
            assert.ok(host === 'api.github.com' || host === 'gist.githubusercontent.com', label + ' ' + c.url);
        });
        assert.deepEqual(result.local.cr.titulos, ['queda'], label);
        assert.equal(result.local.cr.showVistas, true, label);
        assertNoAuthLeak(calls);
        return result;
    }

    const gistGet = {
        match: function (url, init) { return url === API && init.method === 'GET'; },
        respond: function () {
            return jsonResponse(200, {
                files: {
                    'seen.json': {
                        truncated: true,
                        size: 974730,
                        content: '{"cr":',
                        raw_url: RAW
                    }
                }
            });
        }
    };

    await assertPreserved('raw invalid', [
        gistGet,
        { match: function (url) { return url === RAW; }, respond: function () { return textResponse(200, '{"cr":'); } }
    ]);
    await assertPreserved('raw http 500', [
        gistGet,
        { match: function (url) { return url === RAW; }, respond: function () { return textResponse(500, fullRemote); } }
    ]);
    await assertPreserved('raw missing', [
        {
            match: function (url, init) { return url === API && init.method === 'GET'; },
            respond: function () {
                return jsonResponse(200, {
                    files: { 'seen.json': { truncated: true, size: 974730, content: '{"cr":' } }
                });
            }
        }
    ]);
    await assertPreserved('evil raw url', [
        {
            match: function (url, init) { return url === API && init.method === 'GET'; },
            respond: function () {
                return jsonResponse(200, {
                    files: {
                        'seen.json': {
                            truncated: true,
                            content: '{"cr":',
                            raw_url: 'https://evil.test/steal?gist=' + GIST
                        }
                    }
                });
            }
        }
    ]);
    await assertPreserved('content invalid, not truncated', [
        {
            match: function (url, init) { return url === API && init.method === 'GET'; },
            respond: function () {
                return jsonResponse(200, {
                    files: { 'seen.json': { truncated: false, size: 12, content: '{"cr":' } }
                });
            }
        }
    ]);
    await assertPreserved('non-string titulo', [
        {
            match: function (url, init) { return url === API && init.method === 'GET'; },
            respond: function () {
                return jsonResponse(200, {
                    files: {
                        'seen.json': {
                            truncated: false,
                            content: remoteJson({ cr: { titulos: ['ok', 1], urls: [] } })
                        }
                    }
                });
            }
        }
    ]);
    const authFail = await assertPreserved('api 401', [
        { match: function (url) { return url === API; }, respond: function () { return jsonResponse(401, {}); } }
    ]);
    assert.equal(authFail.auth, true);

    /* not truncated, valid, union both ways, no second fetch */
    {
        const input = tabs({ cr: { titulos: ['local-only'], urls: [] } });
        const { fetchImpl, calls } = mockFetch([
            {
                match: function (url, init) { return url === API && init.method === 'GET'; },
                respond: function () {
                    return jsonResponse(200, {
                        files: {
                            'seen.json': {
                                truncated: false,
                                size: fullRemote.length,
                                content: remoteJson({ cr: { titulos: ['remote-only'], urls: ['https://example.test/r'] } })
                            }
                        }
                    });
                }
            },
            {
                match: function (url, init) { return url === API && init.method === 'PATCH'; },
                respond: function () { return jsonResponse(200, {}); }
            }
        ]);
        const result = await SeenGist.exchangeSeenLists(input, TOKEN, 'sync', fetchImpl);
        assert.equal(result.synced, true);
        assert.equal(calls.some(function (c) { return c.url === RAW; }), false);
        assert.deepEqual(patchContent(patches(calls)[0]).cr.titulos, ['local-only', 'remote-only']);
        assertNoAuthLeak(calls);
    }

    /* already in sync: success without PATCH */
    {
        const body = remoteJson({ cr: { titulos: ['mismo'], urls: [] } });
        const input = tabs({ cr: { titulos: ['mismo'], urls: [] } });
        const { fetchImpl, calls } = mockFetch([
            {
                match: function (url, init) { return url === API && init.method === 'GET'; },
                respond: function () {
                    return jsonResponse(200, { files: { 'seen.json': { truncated: false, content: body } } });
                }
            }
        ]);
        const result = await SeenGist.exchangeSeenLists(input, TOKEN, 'sync', fetchImpl);
        assert.equal(result.synced, true);
        assert.equal(result.didPatch, false);
        assert.equal(patches(calls).length, 0);
    }

    /* patch failure after a good read does not replace local with a partial merge */
    {
        const input = tabs({ cr: { titulos: ['local'], urls: [] } });
        const { fetchImpl, calls } = mockFetch([
            {
                match: function (url, init) { return url === API && init.method === 'GET'; },
                respond: function () {
                    return jsonResponse(200, {
                        files: { 'seen.json': { truncated: false, content: remoteJson({ cr: { titulos: ['remote'], urls: [] } }) } }
                    });
                }
            },
            {
                match: function (url, init) { return url === API && init.method === 'PATCH'; },
                respond: function () { return jsonResponse(500, {}); }
            }
        ]);
        const result = await SeenGist.exchangeSeenLists(input, TOKEN, 'force', fetchImpl);
        assert.equal(result.synced, false);
        assert.equal(patches(calls).length, 1);
        assert.deepEqual(result.local.cr.titulos, ['local']);
        assert.deepEqual(input.cr.titulos, ['local']);
    }

    assert.equal(SeenGist.seenSyncLeadText({ busy: true, synced: false, error: false }), 'Sincronizando vistos…');
    assert.equal(SeenGist.seenSyncLeadText({ busy: false, synced: true, error: false, message: '' }), 'Vistos en sync');
    assert.equal(SeenGist.seenSyncLeadText({ busy: false, synced: false, error: false, message: '' }), 'Sin sync de vistos');
    assert.equal(SeenGist.seenSyncLeadText({ busy: false, synced: false, error: true, message: 'No se pudieron sync los vistos. Siguen en este aparato.' }), 'No se pudieron sync los vistos. Siguen en este aparato.');
    assert.notEqual(SeenGist.seenSyncLeadText({ busy: false, synced: false, error: false }), 'Vistos en sync');

    assert.match(html, /src="seen-gist\.js"/);
    assert.match(html, /SeenGist\.seenSyncLeadText\(syncVistosUi\)/);
    assert.match(html, /SeenGist\.exchangeSeenLists/);
    assert.match(html, /if \(result && result\.synced\)/);
    assert.doesNotMatch(html, /busy \? 'Sincronizando vistos…' : 'Vistos en sync'/);
    assert.doesNotMatch(html, /function parseGistSeen/);
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(function (m) { return m[1]; });
    assert.equal(inline.length, 1);
    new Function(inline[0]);

    console.log('seen-gist tests ok');
}

run().catch(function (err) {
    console.error(err);
    process.exit(1);
});
