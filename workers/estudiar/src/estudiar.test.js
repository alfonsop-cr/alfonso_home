import assert from 'node:assert/strict';
import {
  buildNotionPage,
  corsHeaders,
  DEFAULT_DATABASE_ID,
  handleEstudiar,
  mapTab,
  validateEstudiarBody
} from './estudiar.js';

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
const blocked = new Request('https://news.fut5belen.com/api/estudiar', {
  headers: { Origin: 'https://evil.example' }
});
assert.equal(corsHeaders(blocked)['Access-Control-Allow-Origin'], undefined);

function req(method, url, payload, origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request(url, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
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
  req('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'ai' }),
  {}
);
assert.equal(missingToken.status, 500);
assert.equal((await missingToken.json()).error, 'not_configured');

let notionCalls = 0;
const createRes = await handleEstudiar(
  req(
    'POST',
    'https://news.fut5belen.com/api/estudiar',
    { name: 'A', sourceUrl: 'https://x.test/a', tab: 'world', resumen: 'r', requestedAt: '2026-09-12T00:00:00Z' },
    'https://news.fut5belen.com'
  ),
  { NOTION_TOKEN: 'secret-token', NOTION_DATABASE_ID: DEFAULT_DATABASE_ID },
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
  req('POST', 'https://news.fut5belen.com/api/estudiar', { name: 'A', tab: 'us' }),
  { NOTION_TOKEN: 'secret-token' },
  async () => new Response('nope', { status: 401 })
);
assert.equal(notionFail.status, 502);
assert.equal((await notionFail.json()).error, 'notion_create_failed');

console.log('estudiar worker tests ok');
