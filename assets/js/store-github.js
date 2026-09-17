// Store backed by the GitHub Contents API. Saving needs a fine-grained token
// with "Contents: read and write" on this repository; the edit password
// decrypts it from data/edit-key.json (see edit-key.js, written by deploy.sh).
// Pasting the token itself also works. No DOM usage, so node can run this too.

import { decryptToken } from './edit-key.js';

const API = 'https://api.github.com';
const DB_PATH = 'data/db.json';
const UPLOAD_DIR = 'data/paintings';
const KEY_URL = 'data/edit-key.json';
const LOOKS_LIKE_TOKEN = /^(github_pat_|gh[pousr]_)/;

export class StoreError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code; // 'rejected' | 'expired' | 'noPush' | 'network' | 'conflict' | 'failed'
  }
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text.replace(/\s/g, '')), (c) => c.charCodeAt(0));
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

async function fetchKey() {
  let res;
  try {
    res = await fetch(KEY_URL, { cache: 'no-store' });
  } catch {
    throw new StoreError('network');
  }
  return res.ok ? res.json() : null;
}

export function createGithubStore({ owner = 'avs-art', repo = 'avs-art.github.io', branch = 'main', loadKey = fetchKey } = {}) {
  let token = '';

  async function tokenFor(secret) {
    if (LOOKS_LIKE_TOKEN.test(secret)) return { candidate: secret, viaPassword: false };
    const box = await loadKey();
    if (!box) throw new StoreError('rejected');
    try {
      return { candidate: await decryptToken(box, secret), viaPassword: true };
    } catch {
      throw new StoreError('rejected');
    }
  }

  async function api(path, { method = 'GET', body, secret = token } = {}) {
    let res;
    try {
      res = await fetch(`${API}/repos/${owner}/${repo}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${secret}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new StoreError('network');
    }
    if (res.status === 401) throw new StoreError('rejected');
    return res;
  }

  async function getFile(path) {
    const res = await api(`/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new StoreError('failed', `GitHub answered ${res.status} for ${path}`);
    return res.json();
  }

  async function putFile(path, bytes, message, sha) {
    const res = await api(`/contents/${encodePath(path)}`, {
      method: 'PUT',
      body: { message, branch, content: toBase64(bytes), ...(sha ? { sha } : {}) },
    });
    if (res.status === 409 || res.status === 422) throw new StoreError('conflict');
    if (res.status === 403 || res.status === 404) throw new StoreError('noPush');
    if (!res.ok) throw new StoreError('failed', `GitHub answered ${res.status} while saving ${path}`);
    return res.json();
  }

  return {
    kind: 'github',

    async unlock(secret) {
      if (!secret.trim()) throw new StoreError('rejected');
      const { candidate, viaPassword } = await tokenFor(secret.trim());
      let res;
      try {
        res = await api('', { secret: candidate });
      } catch (err) {
        // right password, but GitHub no longer accepts the token behind it
        throw err.code === 'rejected' && viaPassword ? new StoreError('expired') : err;
      }
      if (res.status === 403 || res.status === 404) throw new StoreError(viaPassword ? 'expired' : 'rejected');
      if (!res.ok) throw new StoreError('failed', `GitHub answered ${res.status}`);
      if (!(await res.json()).permissions?.push) throw new StoreError('noPush');
      token = candidate;
    },

    // Read through the API: Pages can lag a minute behind the last publish.
    async load() {
      const file = await getFile(DB_PATH);
      if (!file) throw new StoreError('failed', `${DB_PATH} is missing from the repository`);
      return JSON.parse(new TextDecoder().decode(fromBase64(file.content)));
    },

    async save(db) {
      const bytes = new TextEncoder().encode(JSON.stringify(db, null, 2) + '\n');
      for (let attempt = 0; ; attempt++) {
        const sha = (await getFile(DB_PATH))?.sha;
        try {
          return await putFile(DB_PATH, bytes, 'Update site content', sha);
        } catch (err) {
          if (err.code !== 'conflict' || attempt >= 1) throw err;
        }
      }
    },

    async upload(blob, name, dir = UPLOAD_DIR) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dot = name.lastIndexOf('.');
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      for (let n = 0; ; n++) {
        const path = `${dir}/${stem}${n ? `-${n}` : ''}${ext}`;
        if (await getFile(path)) continue;
        await putFile(path, bytes, `Add ${path}`);
        return path;
      }
    },
  };
}
