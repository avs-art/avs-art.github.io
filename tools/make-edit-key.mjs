#!/usr/bin/env node
// Writes data/edit-key.json: the GitHub token encrypted with the edit
// password. Called by deploy.sh; secrets arrive via the environment so they
// never show up in the process list or shell history.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptToken, decryptToken } from '../assets/js/edit-key.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'edit-key.json');
const { EDIT_TOKEN: token, EDIT_PASSWORD: password } = process.env;

if (!token || !password) {
  console.error('EDIT_TOKEN and EDIT_PASSWORD must be set (run ./deploy.sh instead of calling this directly).');
  process.exit(1);
}

const box = await encryptToken(token, password);
if ((await decryptToken(box, password)) !== token) throw new Error('Self-check failed: the key does not decrypt');
await fs.writeFile(OUT, JSON.stringify(box, null, 2) + '\n');
console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
