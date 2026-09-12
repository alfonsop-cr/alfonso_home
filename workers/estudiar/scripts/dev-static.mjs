import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleEstudiar } from '../src/estudiar.js';

const root = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '../../..'));
const port = Number(process.env.PORT || 8080);
const mockNotion = process.env.MOCK_NOTION === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const env = {
  NOTION_TOKEN: process.env.NOTION_TOKEN || (mockNotion ? 'mock-token' : ''),
  NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID || 'e407609f-7e65-4551-863d-ee4809d0b73c'
};

const fetchImpl = mockNotion
  ? async () => new Response(JSON.stringify({ id: 'mock-page' }), { status: 200 })
  : fetch;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/estudiar') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const workerReq = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : Buffer.concat(chunks)
      });
      const workerRes = await handleEstudiar(workerReq, env, fetchImpl);
      res.writeHead(workerRes.status, Object.fromEntries(workerRes.headers));
      res.end(Buffer.from(await workerRes.arrayBuffer()));
      return;
    }
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(500);
    res.end('error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log('dev-static http://127.0.0.1:' + port + (mockNotion ? ' (MOCK_NOTION)' : ''));
});
