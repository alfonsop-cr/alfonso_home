export const DEFAULT_DATABASE_ID = 'e407609f-7e65-4551-863d-ee4809d0b73c';
export const NOTION_VERSION = '2022-06-28';
export const NOTION_TABS = ['Costa Rica', 'AI', 'US', 'World'];

const TAB_MAP = {
  cr: 'Costa Rica',
  ai: 'AI',
  us: 'US',
  world: 'World',
  'costa rica': 'Costa Rica',
  costa_rica: 'Costa Rica'
};

const ALLOWED_ORIGINS = new Set([
  'https://news.fut5belen.com',
  'https://www.news.fut5belen.com',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'http://127.0.0.1:8787',
  'http://localhost:8787'
]);

export function mapTab(tab) {
  const raw = typeof tab === 'string' ? tab.trim() : '';
  if (!raw) return '';
  if (NOTION_TABS.indexOf(raw) !== -1) return raw;
  return TAB_MAP[raw] || TAB_MAP[raw.toLowerCase()] || '';
}

export function validateEstudiarBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, status: 400, error: 'name_required' };

  let sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, status: 400, error: 'source_url_invalid' };
      }
    } catch (e) {
      return { ok: false, status: 400, error: 'source_url_invalid' };
    }
  } else {
    sourceUrl = '';
  }

  const tab = mapTab(body.tab);
  if (!tab) return { ok: false, status: 400, error: 'tab_invalid' };

  const resumen = typeof body.resumen === 'string' ? body.resumen.trim() : '';

  return {
    ok: true,
    value: {
      name: name.slice(0, 2000),
      sourceUrl,
      tab,
      resumen: resumen.slice(0, 2000)
    }
  };
}

export function buildNotionPage(databaseId, value) {
  return {
    parent: { database_id: databaseId },
    properties: {
      Name: { title: [{ type: 'text', text: { content: value.name } }] },
      Status: { select: { name: 'New' } },
      'Source URL': { url: value.sourceUrl || null },
      Tab: { select: { name: value.tab } },
      Resumen: value.resumen
        ? { rich_text: [{ type: 'text', text: { content: value.resumen } }] }
        : { rich_text: [] }
    }
  };
}

export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(status, data, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}

export async function handleEstudiar(request, env, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const cors = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' }, cors);
  }

  const path = new URL(request.url).pathname;
  if (path !== '/' && path !== '/api/estudiar') {
    return json(404, { ok: false, error: 'not_found' }, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(400, { ok: false, error: 'invalid_json' }, cors);
  }

  const parsed = validateEstudiarBody(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error }, cors);

  const token = env && env.NOTION_TOKEN ? String(env.NOTION_TOKEN).trim() : '';
  const databaseId = (env && env.NOTION_DATABASE_ID) || DEFAULT_DATABASE_ID;
  if (!token) return json(500, { ok: false, error: 'not_configured' }, cors);

  const notionRes = await doFetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    },
    body: JSON.stringify(buildNotionPage(databaseId, parsed.value))
  });

  if (!notionRes.ok) {
    return json(502, { ok: false, error: 'notion_create_failed' }, cors);
  }

  let created = {};
  try {
    created = await notionRes.json();
  } catch (e) {
    created = {};
  }

  return json(200, { ok: true, id: created.id || null }, cors);
}
