// Store backed by tools/dev-server.mjs, for editing on a local checkout.

import { StoreError } from './store-github.js';

export function createLocalStore() {
  let password = '';

  async function call(path, init = {}, secret = password) {
    let res;
    try {
      res = await fetch(path, { ...init, headers: { ...init.headers, 'X-Edit-Password': secret } });
    } catch {
      throw new StoreError('network');
    }
    if (res.status === 401) throw new StoreError('rejected');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new StoreError('failed', body.error ?? `Server answered ${res.status}`);
    return body;
  }

  return {
    kind: 'local',

    async unlock(secret) {
      await call('api/auth', { method: 'POST' }, secret);
      password = secret;
    },

    async load() {
      const res = await fetch('data/db.json', { cache: 'no-store' });
      if (!res.ok) throw new StoreError('failed', `Could not load data/db.json (${res.status})`);
      return res.json();
    },

    save(db) {
      return call('api/db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db),
      });
    },

    async upload(blob, name, dir = 'data/paintings') {
      const query = new URLSearchParams({ name, dir });
      return (await call(`api/upload?${query}`, { method: 'POST', body: blob })).path;
    },
  };
}

export async function localStoreAvailable() {
  try {
    const res = await fetch('api/ping', { cache: 'no-store' });
    return res.ok && (await res.json()).editable === true;
  } catch {
    return false;
  }
}
