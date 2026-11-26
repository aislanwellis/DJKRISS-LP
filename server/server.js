#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  Servidor do pre-save DJ KRISS — sem dependências (Node 18+)
//  • Serve o site estático (pasta acima desta)
//  • API do mural:  GET  /api/mensagens   → últimas mensagens
//                   POST /api/mensagens   → { nome, mensagem }
//                   DELETE /api/mensagens/:id  (header X-Admin-Token)
//  Variáveis de ambiente:
//    PORT=3077  HOST=127.0.0.1
//    DATA_DIR=./data            onde fica mensagens.json
//    ADMIN_TOKEN=...            para apagar mensagens
//    MODERACAO=1                novas mensagens só aparecem após aprovação
// ─────────────────────────────────────────────────────────────
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 3077;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB = path.join(DATA_DIR, 'mensagens.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MODERACAO = process.env.MODERACAO === '1';
const MAX_NOME = 40, MAX_MSG = 280, LISTA = 120;

const BLOQUEADAS = ['http://', 'https://', 'www.', '.com/', 'bit.ly', 't.me/', 'wa.me/'];

fs.mkdirSync(DATA_DIR, { recursive: true });
let mensagens = [];
try { mensagens = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) { mensagens = []; }

let saving = Promise.resolve();
function persist() {
  saving = saving.then(async () => {
    const tmp = DB + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(mensagens.slice(0, 5000)));
    await fsp.rename(tmp, DB);
  }).catch((e) => console.error('erro ao salvar', e));
}

// limite por IP: 1 a cada 20s, 8 por hora
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (h.length && now - h[h.length - 1] < 20e3) return 'Calma! Espera uns segundos para mandar outra.';
  if (h.length >= 8) return 'Limite de mensagens atingido. Tenta de novo mais tarde.';
  h.push(now); hits.set(ip, h);
  return null;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

const clean = (s, max) => String(s || '')
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function send(res, code, obj, extra = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const publicas = () => mensagens.filter((m) => m.ok).slice(0, LISTA).map(({ id, nome, mensagem, ts }) => ({ id, nome, mensagem, ts }));

async function api(req, res, url) {
  // atrás do nginx: X-Real-IP é definido pelo proxy (não confiar em X-Forwarded-For do cliente)
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  if (req.method === 'GET' && url.pathname === '/api/mensagens') return send(res, 200, { mensagens: publicas() });

  if (req.method === 'POST' && url.pathname === '/api/mensagens') {
    let data;
    try { data = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { erro: 'Requisição inválida.' }); }
    if (data.site) return send(res, 200, { ok: true, moderada: true }); // honeypot (bot)
    const nome = clean(data.nome, MAX_NOME);
    const mensagem = clean(data.mensagem, MAX_MSG);
    if (nome.length < 2) return send(res, 400, { erro: 'Coloca seu nome (mínimo 2 letras).' });
    if (mensagem.length < 3) return send(res, 400, { erro: 'Escreve sua mensagem.' });
    const low = (nome + ' ' + mensagem).toLowerCase();
    if (BLOQUEADAS.some((b) => low.includes(b))) return send(res, 400, { erro: 'Links não são permitidos no mural.' });
    const lim = limited(ip);
    if (lim) return send(res, 429, { erro: lim });
    const m = { id: crypto.randomBytes(6).toString('hex'), nome, mensagem, ts: Date.now(), ok: !MODERACAO, ip: crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 12) };
    mensagens.unshift(m);
    persist();
    return send(res, 201, { ok: true, moderada: MODERACAO, mensagem: MODERACAO ? null : { id: m.id, nome, mensagem, ts: m.ts } });
  }

  // admin
  const mm = url.pathname.match(/^\/api\/mensagens\/([a-f0-9]{12})(\/aprovar)?$/);
  if (mm && ADMIN_TOKEN && req.headers['x-admin-token'] === ADMIN_TOKEN) {
    const i = mensagens.findIndex((m) => m.id === mm[1]);
    if (i < 0) return send(res, 404, { erro: 'não encontrada' });
    if (req.method === 'DELETE') { mensagens.splice(i, 1); persist(); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && mm[2]) { mensagens[i].ok = true; persist(); return send(res, 200, { ok: true }); }
  }
  if (url.pathname === '/api/admin/mensagens' && ADMIN_TOKEN && req.headers['x-admin-token'] === ADMIN_TOKEN) {
    return send(res, 200, { mensagens });
  }
  return send(res, 404, { erro: 'não encontrado' });
}

// ── Estático (útil para testar sem nginx) ─────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
const PRIVADO = /^\/(server|deploy|\.git)(\/|$)/;
async function serveStatic(req, res, url) {
  let p;
  try { p = path.posix.normalize(decodeURIComponent(url.pathname)); } catch (e) { res.writeHead(400); return res.end(); }
  if (PRIVADO.test(p) || /\/\./.test(p)) { res.writeHead(404); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw 0;
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type === 'audio/mpeg') {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = +s, end = e ? +e : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch((e) => { console.error(e); send(res, 500, { erro: 'Erro interno.' }); });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
}).listen(PORT, HOST, () => console.log(`DJ KRISS pre-save em http://${HOST}:${PORT}  (moderação: ${MODERACAO ? 'ligada' : 'desligada'})`));
