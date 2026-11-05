/* Seen-gist sync. No compaction. Invalid JSON is a failure, never an empty list. */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.SeenGist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var SEEN_GIST_ID = '78e4f6f3a1f689e2683ea000688a50c9';
    var SEEN_GIST_FILE = 'seen.json';
    var SEEN_GIST_API = 'https://api.github.com/gists/' + SEEN_GIST_ID;
    var SEEN_TAB_IDS = ['cr', 'ai', 'us', 'world'];

    function fail(code) {
        var err = new Error(code);
        err.code = code;
        return err;
    }

    function emptyRemote() {
        var out = {};
        SEEN_TAB_IDS.forEach(function (id) {
            out[id] = { titulos: [], urls: [] };
        });
        return out;
    }

    function cleanStringList(list) {
        var out = [];
        (Array.isArray(list) ? list : []).forEach(function (x) {
            if (typeof x === 'string' && x && out.indexOf(x) === -1) out.push(x);
        });
        return out;
    }

    function readStringListStrict(list) {
        if (list == null) return [];
        if (!Array.isArray(list)) throw fail('bad-json');
        var out = [];
        list.forEach(function (x) {
            if (typeof x !== 'string') throw fail('bad-json');
            if (x && out.indexOf(x) === -1) out.push(x);
        });
        return out;
    }

    function isAllowedSeenGistUrl(url) {
        var parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return false;
        }
        if (parsed.protocol !== 'https:') return false;
        if (parsed.username || parsed.password) return false;
        var host = parsed.hostname.toLowerCase();
        var parts = parsed.pathname.split('/');
        if (host === 'api.github.com') {
            return parts[1] === 'gists' && parts[2] === SEEN_GIST_ID &&
                (parts.length === 3 || (parts.length === 4 && !!parts[3]));
        }
        if (host === 'gist.githubusercontent.com') {
            return parts.length >= 5 &&
                !!parts[1] && parts[1] !== '.' && parts[1] !== '..' &&
                parts[2] === SEEN_GIST_ID &&
                parts[3] === 'raw' &&
                !!parts[4];
        }
        return false;
    }

    function headersForSeenUrl(token, url) {
        if (!isAllowedSeenGistUrl(url)) throw fail('bad-url');
        var host = new URL(url).hostname.toLowerCase();
        if (host === 'api.github.com') {
            return {
                Accept: 'application/vnd.github+json',
                Authorization: 'Bearer ' + token,
                'X-GitHub-Api-Version': '2022-11-28'
            };
        }
        /* gist.githubusercontent.com rejects Authorization on CORS preflight and
           can 404 when a bearer is present. The allowlisted raw path is the
           capability; the token stays on api.github.com only. */
        return { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' };
    }

    function parseGistSeen(content) {
        if (typeof content !== 'string') throw fail('bad-json');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        if (content.trim() === '') throw fail('bad-json');
        var parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            throw fail('bad-json');
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail('bad-json');
        var fresh = emptyRemote();
        SEEN_TAB_IDS.forEach(function (id) {
            if (!Object.prototype.hasOwnProperty.call(parsed, id) || parsed[id] == null) return;
            var tab = parsed[id];
            if (typeof tab !== 'object' || Array.isArray(tab)) throw fail('bad-json');
            fresh[id].titulos = readStringListStrict(tab.titulos);
            fresh[id].urls = readStringListStrict(tab.urls);
        });
        return fresh;
    }

    function seenFileNeedsRaw(file) {
        if (!file || typeof file !== 'object') return false;
        if (file.truncated === true) return true;
        return typeof file.content !== 'string';
    }

    function cloneLocal(state) {
        var out = {};
        SEEN_TAB_IDS.forEach(function (id) {
            var tab = (state && state[id]) || {};
            out[id] = {
                showVistas: !!tab.showVistas,
                titulos: cleanStringList(tab.titulos),
                urls: cleanStringList(tab.urls)
            };
        });
        return out;
    }

    function hasExtras(localList, remoteList) {
        return (localList || []).some(function (x) {
            return x && (remoteList || []).indexOf(x) === -1;
        });
    }

    function unionLists(a, b) {
        return cleanStringList([].concat(a || [], b || []));
    }

    function unionInto(local, remote) {
        var extras = false;
        SEEN_TAB_IDS.forEach(function (id) {
            var left = local[id];
            var right = (remote && remote[id]) || { titulos: [], urls: [] };
            if (hasExtras(left.titulos, right.titulos) || hasExtras(left.urls, right.urls)) extras = true;
            left.titulos = unionLists(left.titulos, right.titulos);
            left.urls = unionLists(left.urls, right.urls);
        });
        return extras;
    }

    function payloadFrom(state) {
        var out = {};
        SEEN_TAB_IDS.forEach(function (id) {
            var tab = state[id] || { titulos: [], urls: [] };
            out[id] = {
                titulos: cleanStringList(tab.titulos),
                urls: cleanStringList(tab.urls)
            };
        });
        return out;
    }

    function seenSyncLeadText(ui) {
        ui = ui || {};
        if (ui.busy) return 'Sincronizando vistos…';
        if (ui.synced && !ui.error) return 'Vistos en sync';
        return ui.message || 'Sin sync de vistos';
    }

    async function readRemoteSeen(token, fetchFn) {
        var res = await fetchFn(SEEN_GIST_API, {
            method: 'GET',
            headers: headersForSeenUrl(token, SEEN_GIST_API),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error'
        });
        if (res.status === 401 || res.status === 403) throw fail('auth');
        if (!res.ok) throw fail('gist-get');
        var data;
        try {
            data = await res.json();
        } catch (e) {
            throw fail('bad-json');
        }
        var file = data && data.files && data.files[SEEN_GIST_FILE];
        if (!file) return emptyRemote();
        var text;
        if (seenFileNeedsRaw(file)) {
            if (typeof file.raw_url !== 'string') throw fail('bad-url');
            var rawRes = await fetchFn(file.raw_url, {
                method: 'GET',
                headers: headersForSeenUrl(token, file.raw_url),
                cache: 'no-store',
                credentials: 'omit',
                redirect: 'error'
            });
            if (!rawRes.ok) throw fail('gist-raw');
            try {
                text = await rawRes.text();
            } catch (e2) {
                throw fail('gist-raw');
            }
        } else {
            text = file.content;
        }
        return parseGistSeen(text);
    }

    async function patchRemote(token, fetchFn, payload) {
        var res = await fetchFn(SEEN_GIST_API, {
            method: 'PATCH',
            headers: Object.assign({
                'Content-Type': 'application/json'
            }, headersForSeenUrl(token, SEEN_GIST_API)),
            body: JSON.stringify({
                files: {
                    'seen.json': { content: JSON.stringify(payload) }
                }
            }),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error'
        });
        if (res.status === 401 || res.status === 403) throw fail('auth');
        if (!res.ok) throw fail('gist-patch');
    }

    async function exchangeSeenLists(localState, token, mode, fetchImpl) {
        var fetchFn = fetchImpl || fetch;
        var original = cloneLocal(localState);
        try {
            var remote = await readRemoteSeen(token, fetchFn);
            var merged = cloneLocal(original);
            var extras = unionInto(merged, remote);
            var didPatch = false;
            if (mode === 'force' || extras) {
                await patchRemote(token, fetchFn, payloadFrom(merged));
                didPatch = true;
            }
            return { ok: true, synced: true, local: merged, didPatch: didPatch, auth: false };
        } catch (e) {
            return {
                ok: false,
                synced: false,
                local: original,
                didPatch: false,
                auth: !!(e && e.code === 'auth')
            };
        }
    }

    return {
        SEEN_GIST_ID: SEEN_GIST_ID,
        SEEN_GIST_FILE: SEEN_GIST_FILE,
        SEEN_GIST_API: SEEN_GIST_API,
        isAllowedSeenGistUrl: isAllowedSeenGistUrl,
        headersForSeenUrl: headersForSeenUrl,
        parseGistSeen: parseGistSeen,
        seenFileNeedsRaw: seenFileNeedsRaw,
        seenSyncLeadText: seenSyncLeadText,
        exchangeSeenLists: exchangeSeenLists
    };
});
