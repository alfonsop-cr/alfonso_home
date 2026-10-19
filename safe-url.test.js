import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('function safeUrl(');
const end = html.indexOf('function escapeHtml(');
assert.ok(start >= 0 && end > start, 'safeUrl must sit next to escapeHtml in index.html');
const safeUrl = new Function(html.slice(start, end) + '\nreturn safeUrl;')();

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

assert.equal(safeUrl('https://nacion.com/a'), 'https://nacion.com/a');
assert.equal(safeUrl('http://127.0.0.1:8080/x'), 'http://127.0.0.1:8080/x');
assert.equal(safeUrl('HTTPS://Example.com/Path'), 'HTTPS://Example.com/Path');
assert.equal(safeUrl('  https://example.com/a  '), 'https://example.com/a');
assert.equal(safeUrl('mailto:a@b.com'), 'mailto:a@b.com');
assert.equal(safeUrl('mailto:a@b.com?subject=Hola mundo'), 'mailto:a@b.com?subject=Hola mundo');
assert.equal(safeUrl('/ruta'), '/ruta');
assert.equal(safeUrl('./ruta'), './ruta');
assert.equal(safeUrl('../ruta'), '../ruta');
assert.equal(safeUrl('ruta/relativa'), 'ruta/relativa');
assert.equal(safeUrl('?x=1'), '?x=1');
assert.equal(safeUrl('#ancla'), '#ancla');
assert.equal(safeUrl('//cdn.example/a'), '//cdn.example/a');
assert.equal(safeUrl('https://gee.bccr.fi.cr/x?CodCuadro=770&idioma=1'), 'https://gee.bccr.fi.cr/x?CodCuadro=770&idioma=1');

assert.equal(safeUrl('javascript:alert(1)'), '#');
assert.equal(safeUrl('JAVASCRIPT:alert(1)'), '#');
assert.equal(safeUrl(' javascript:alert(1)'), '#');
assert.equal(safeUrl('java\tscript:alert(1)'), '#');
assert.equal(safeUrl('java\nscript:alert(1)'), '#');
assert.equal(safeUrl('java\rscript:alert(1)'), '#');
assert.equal(safeUrl('\tjavascript:alert(1)'), '#');
assert.equal(safeUrl('data:text/html,hi'), '#');
assert.equal(safeUrl('vbscript:msgbox(1)'), '#');
assert.equal(safeUrl('file:///etc/passwd'), '#');
assert.equal(safeUrl('blob:https://news.fut5belen.com/x'), '#');
assert.equal(safeUrl('foo:bar'), '#');
assert.equal(safeUrl('\\\\evil.com'), '#');
assert.equal(safeUrl(''), '#');
assert.equal(safeUrl('   '), '#');
assert.equal(safeUrl(null), '#');
assert.equal(safeUrl(undefined), '#');

const blocked = '<a href="' + escapeHtml(safeUrl('javascript:alert(1)')) + '">';
assert.equal(blocked, '<a href="#">');
const kept = '<a href="' + escapeHtml(safeUrl('https://nacion.com/a?x=1&y=2')) + '">';
assert.equal(kept, '<a href="https://nacion.com/a?x=1&amp;y=2">');

assert.match(html, /var monexHref = safeUrl\(d\.fuenteUrl\);\s*if \(monexHref !== '#'\) document\.getElementById\('monex-fuente'\)\.href = monexHref;/);
assert.match(html, /var bacHref = safeUrl\(d\.fuenteUrl\);\s*if \(bacHref !== '#'\) document\.getElementById\('bac-fuente'\)\.href = bacHref;/);
assert.match(html, /if \(href === '#'\)/);
assert.match(html, /<span class="fuente-invalida" title="Enlace no válido">/);
assert.match(html, /href="' \+ escapeHtml\(href\) \+ '"/);
assert.match(html, /alfonso\.news\.estudiar\.key/);
assert.match(html, /'X-Estudiar-Key': clave/);
assert.match(html, /estudiarKeyPrompted = false/);

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.equal(scripts.length, 1);
new Function(scripts[0]);

console.log('safeUrl tests ok');
