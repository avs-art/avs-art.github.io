#!/usr/bin/env node
// Local dev server: serves the static site and exposes a small
// password-protected API that writes data/db.json and painting uploads.
// Node stdlib only. Usage: node tools/dev-server.mjs [--port 8000] [--lan]

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const UPLOAD_DIRS = new Set(['data/paintings', 'data/site']);
const MAX_DB_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PORT = Number(argValue('--port') ?? process.env.PORT ?? 8000);
const HOST = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};
const IMAGE_EXTS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif']);
const STATUSES = new Set(['for_sale', 'sold', 'on_order']);

function loadPassword() {
  if (process.env.EDIT_PASSWORD) return { value: process.env.EDIT_PASSWORD, source: 'EDIT_PASSWORD env' };
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const m = env.match(/^\s*EDIT_PASSWORD\s*=\s*(.+?)\s*$/m);
    if (m) return { value: m[1].replace(/^["']|["']$/g, ''), source: '.env.local' };
  } catch {}
  return { value: crypto.randomBytes(9).toString('base64url'), source: 'generated' };
}
const PASSWORD = loadPassword();

function authorized(req) {
  const given = Buffer.from(String(req.headers['x-edit-password'] ?? ''));
  const want = Buffer.from(PASSWORD.value);
  // Hash both sides so timingSafeEqual gets equal-length inputs.
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? MIME['.json'] : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function validateDb(db) {
  const fail = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw fail('db must be an object');
  if (!db.site || typeof db.site !== 'object') throw fail('db.site must be an object');
  if (!Array.isArray(db.paintings)) throw fail('db.paintings must be an array');
  const slugs = new Set();
  for (const [i, p] of db.paintings.entries()) {
    const at = `paintings[${i}]`;
    if (!p || typeof p !== 'object') throw fail(`${at} must be an object`);
    if (typeof p.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) throw fail(`${at}.slug must be lowercase-kebab-case`);
    if (slugs.has(p.slug)) throw fail(`${at}.slug "${p.slug}" is duplicated`);
    slugs.add(p.slug);
    if (typeof p.name?.ru !== 'string' || !p.name.ru.trim()) throw fail(`${at}.name.ru is required`);
    if (!STATUSES.has(p.status)) throw fail(`${at}.status must be one of ${[...STATUSES].join(', ')}`);
    if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0) throw fail(`${at}.price must be a non-negative number`);
    if (typeof p.img !== 'string' || !p.img || p.img.includes('..')) throw fail(`${at}.img must be a relative path`);
    if (typeof p.order !== 'number' || !Number.isFinite(p.order)) throw fail(`${at}.order must be a number`);
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

async function uniqueUploadName(dir, name) {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, path.extname(name))
    .normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'painting';
  for (let n = 0; ; n++) {
    const candidate = `${stem}${n ? `-${n}` : ''}${ext}`;
    try { await fsp.access(path.join(dir, candidate)); } catch { return candidate; }
  }
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/ping') return send(res, 200, { ok: true, editable: true });

  if (!authorized(req)) return send(res, 401, { error: 'Wrong password' });

  if (route === 'POST /api/auth') return send(res, 200, { ok: true });

  if (route === 'PUT /api/db') {
    const body = await readBody(req, MAX_DB_BYTES);
    let db;
    try { db = JSON.parse(body.toString('utf8')); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    validateDb(db);
    await writeAtomic(DB_PATH, JSON.stringify(db, null, 2) + '\n');
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/upload') {
    const requested = path.basename(url.searchParams.get('name') ?? '');
    if (!IMAGE_EXTS.has(path.extname(requested).toLowerCase())) {
      return send(res, 415, { error: `Only ${[...IMAGE_EXTS].join(' ')} images can be uploaded` });
    }
    const body = await readBody(req, MAX_UPLOAD_BYTES);
    if (!body.length) return send(res, 400, { error: 'Empty upload' });
    const dir = url.searchParams.get('dir') ?? 'data/paintings';
    if (!UPLOAD_DIRS.has(dir)) return send(res, 400, { error: 'Unknown upload directory' });
    const target = path.join(ROOT, dir);
    await fsp.mkdir(target, { recursive: true });
    const name = await uniqueUploadName(target, requested);
    await writeAtomic(path.join(target, name), body);
    return send(res, 200, { ok: true, path: `${dir}/${name}` });
  }

  return send(res, 404, { error: 'Unknown API route' });
}

async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad path'); }
  let file = path.resolve(ROOT, '.' + path.posix.normalize('/' + rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  // Never serve dotfiles (.git, .env.local, ...).
  if (path.relative(ROOT, file).split(path.sep).some((seg) => seg.startsWith('.') && seg !== '.')) {
    return send(res, 404, 'Not found');
  }
  let stat;
  try {
    stat = await fsp.stat(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = await fsp.stat(file);
    }
  } catch {
    return send(res, 404, 'Not found');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) send(res, err.status ?? 500, { error: err.message ?? 'Server error' });
    else res.end();
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  avs-art dev server`);
  console.log(`  local:    http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) console.log(`  network:  http://${a.address}:${PORT}`);
      }
    }
  }
  console.log(`  edit password (${PASSWORD.source}): ${PASSWORD.value}\n`);
});
