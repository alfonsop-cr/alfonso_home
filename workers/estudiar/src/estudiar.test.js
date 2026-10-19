import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildNotionPage,
  corsHeaders,
  DEFAULT_DATABASE_ID,
  handleEstudiar,
  hasValidEstudiarKey,
  mapTab,
  timingSafeEqualString,
  validateEstudiarBody
} from './estudiar.js';

const ESTUDIAR_KEY = 'estudiar-test-key';

function body(value) {
  return validateEstudiarBody(value);
}

assert.equal(mapTab('cr'), 'Costa Rica');
assert.equal(mapTab('ai'), 'AI');
assert.equal(mapTab('us'), 'US');
assert.equal(mapTab('world'), 'World');
assert.equal(mapTab('Costa Rica'), 'Costa Rica');
assert.equal(mapTab('nope'), '');

assert.equal(body(null).error, 'invalid_body');
assert.equal(body({ sourceUrl: 'https://a.example', tab: 'cr' }).error, 'name_required');
assert.equal(body({ name: 'Tema', tab: 'xx' }).error, 'tab_invalid');
assert.equal(body({ name: 'Tema', tab: 'cr', sourceUrl: 'nota-url' }).error, 'source_url_invalid');

const ok = body({
  name: '  Corte  ',
  sourceUrl: 'https://nacion.com/a',
  tab: 'cr',
  resumen: 'Resumen corto'
});
assert.equal(ok.ok, true);
assert.deepEqual(ok.value, {
  name: 'Corte',
  sourceUrl: 'https://nacion.com/a',
  tab: 'Costa Rica',
  resumen: 'Resumen corto'
});

const page = buildNotionPage(DEFAULT_DATABASE_ID, ok.value);
assert.equal(page.parent.database_id, DEFAULT_DATABASE_ID);
assert.equal(page.properties.Status.select.name, 'New');
assert.equal(page.properties.Name.title[0].text.content, 'Corte');
assert.equal(page.properties['Source URL'].url, 'https://nacion.com/a');
assert.equal(page.properties.Tab.select.name, 'Costa Rica');
assert.equal(page.properties.Resumen.rich_text[0].text.content, 'Resumen corto');
assert.equal(Object.prototype.hasOwnProperty.call(page.properties, 'Briefing'), false);

const corsReq = new Request('https://news.fut5belen.com/api/estudiar', {
  headers: { Origin: 'https://news.fut5belen.com' }
});
assert.equal(corsHeaders(corsReq)['Access-Control-Allow-Origin'], 'https://news.fut5belen.com');
assert.match(corsHeaders(corsReq)['Access-Control-Allow-Headers'], /X-Estudiar-Key/);
const blocked = new Request('https://news.fut5belen.com/api/estudiar', {
  headers: { Origin: 'https://evil.example' }
});
assert.equal(corsHeaders(blocked)['Access-Control-Allow-Origin'], undefined);

assert.equal(timingSafeEqualString('abc', 'abc'), true);
assert.equal(timingSafeEqualString('abc', 'abd'), false);
assert.equal(timingSafeEqualString('abc', 'abcd'), false);
assert.equal(timingSafeEqualString('clé', 'clé'), true);
assert.equal(timingSafeEqualString('clé', 'cle'), false);
assert.equal(hasValidEstudiarKey('k', 'k'), true);
assert.equal(hasValidEstudiarKey('k', 'other'), false);
assert.equal(hasValidEstudiarKey(null, 'k'), false);
assert.equal(hasValidEstudiarKey('k', ''), false);
assert.equal(hasValidEstudiarKey('k', undefined), false);

function req(method, url, payload, origin, headersExtra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, headersExtra || {});
  if (origin) headers.Origin = origin;
  return new Request(url, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
}

function authed(method, url, payload, origin) {
  return req(method, url, payload, origin, { 'X-Estudiar-Key': ESTUDIAR_KEY });
}

const optionsRes = await handleEstudiar(
  new Request('https://news.fut5belen.com/api/estudiar', {
    method: 'OPTIONS',
    headers: { Origin: 'https://news.fut5belen.com' }
  }),
  { NOTION_TOKEN: 'secret' }
);
assert.equal(optionsRes.status, 204);

const getRes = await handleEstudiar(
  req('GET', 'https://news.fut5belen.com/api/estudiar'),
  { NOTION_TOKEN: 'secret' }
);
assert.equal(getRes.status, 405);

const missingToken = await handleEstudiar(
  authed('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'ai' }),
  { ESTUDIAR_KEY }
);
assert.equal(missingToken.status, 500);
assert.equal((await missingToken.json()).error, 'not_configured');

let notionCalls = 0;
async function rejectNotion() {
  notionCalls += 1;
  throw new Error('notion should not be called');
}

const missingKey = await handleEstudiar(
  req('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'ai' }),
  { ESTUDIAR_KEY, NOTION_TOKEN: 'secret-token' },
  rejectNotion
);
assert.equal(missingKey.status, 401);
assert.equal((await missingKey.json()).error, 'unauthorized');
assert.equal(notionCalls, 0);

const wrongKey = await handleEstudiar(
  req('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'ai' }, 'https://news.fut5belen.com', {
    'X-Estudiar-Key': 'nope'
  }),
  { ESTUDIAR_KEY, NOTION_TOKEN: 'secret-token' },
  rejectNotion
);
assert.equal(wrongKey.status, 401);
assert.equal(wrongKey.headers.get('Access-Control-Allow-Origin'), 'https://news.fut5belen.com');
assert.equal((await wrongKey.json()).error, 'unauthorized');
assert.equal(notionCalls, 0);

const unsetSecret = await handleEstudiar(
  authed('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'ai' }),
  { NOTION_TOKEN: 'secret-token' },
  rejectNotion
);
assert.equal(unsetSecret.status, 401);
assert.equal((await unsetSecret.json()).error, 'unauthorized');

const emptySecret = await handleEstudiar(
  authed('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'ai' }),
  { ESTUDIAR_KEY: '', NOTION_TOKEN: 'secret-token' },
  rejectNotion
);
assert.equal(emptySecret.status, 401);
assert.equal(notionCalls, 0);

const lowerHeader = await handleEstudiar(
  req('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'xx' }, null, {
    'x-estudiar-key': ESTUDIAR_KEY
  }),
  { ESTUDIAR_KEY, NOTION_TOKEN: 'secret-token' },
  rejectNotion
);
assert.equal(lowerHeader.status, 400);
assert.equal((await lowerHeader.json()).error, 'tab_invalid');
assert.equal(notionCalls, 0);

const createRes = await handleEstudiar(
  authed(
    'POST',
    'https://news.fut5belen.com/api/estudiar',
    { name: 'A', sourceUrl: 'https://x.test/a', tab: 'world', resumen: 'r', requestedAt: '2026-09-12T00:00:00Z' },
    'https://news.fut5belen.com'
  ),
  { ESTUDIAR_KEY, NOTION_TOKEN: 'secret-token', NOTION_DATABASE_ID: DEFAULT_DATABASE_ID },
  async (url, init) => {
    notionCalls += 1;
    assert.equal(url, 'https://api.notion.com/v1/pages');
    assert.match(init.headers.Authorization, /^Bearer secret-token$/);
    const sent = JSON.parse(init.body);
    assert.equal(sent.properties.Tab.select.name, 'World');
    assert.equal(sent.properties.Status.select.name, 'New');
    return new Response(JSON.stringify({ id: 'page-1' }), { status: 200 });
  }
);
assert.equal(createRes.status, 200);
assert.equal(createRes.headers.get('Access-Control-Allow-Origin'), 'https://news.fut5belen.com');
assert.deepEqual(await createRes.json(), { ok: true, id: 'page-1' });
assert.equal(notionCalls, 1);

const notionFail = await handleEstudiar(
  authed('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'us' }),
  { ESTUDIAR_KEY, NOTION_TOKEN: 'secret-token' },
  async () => new Response('nope', { status: 401 })
);
assert.equal(notionFail.status, 502);
assert.equal((await notionFail.json()).error, 'notion_create_failed');

const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
assert.match(toml, /workers_dev\s*=\s*false/);

console.log('estudiar worker tests ok');
