// Small helpers for the app's local settings file.
// Windows editors often save ".env" as ".env.txt", and some people paste their key
// into .env.example; both are read as fallbacks so a pasted key is not silently ignored.
import {readFileSync, writeFileSync, renameSync, existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';

const CANDIDATES = ['.env.local', '.env', '.env.txt', 'env', 'env.txt', '.env.example'];

export function readEnv(root) {
  const merged = {};
  // Later files only fill gaps, so .env always wins.
  for (const name of [...CANDIDATES].reverse()) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    try {
      const values = parseEnv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
      for (const [key, value] of Object.entries(values)) if (String(value).trim()) merged[key] = String(value).trim();
    } catch {}
  }
  // .env wins over the fallbacks above, and .env.local wins over .env.
  for (const primary of [path.join(root, '.env'), path.join(root, '.env.local')]) if (existsSync(primary)) {
    try { Object.assign(merged, Object.fromEntries(Object.entries(parseEnv(readFileSync(primary, 'utf8').replace(/^﻿/, ''))).filter(([, v]) => String(v).trim()).map(([k, v]) => [k, String(v).trim()]))); } catch {}
  }
  return merged;
}

export function envValue(root, key, fallback = '') {
  const local = readEnv(root);
  return String(local[key] || process.env[key] || fallback).trim();
}

export function setEnvValue(root, key, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid setting name.');
  const file = path.join(root, '.env');
  let contents = '';
  try { contents = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch {}
  const entry = `${key}=${JSON.stringify(String(value).trim())}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const updated = pattern.test(contents) ? contents.replace(pattern, entry) : `${contents}${contents && !contents.endsWith('\n') ? '\n' : ''}${entry}\n`;
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, updated, {encoding: 'utf8', mode: 0o600});
  renameSync(temporary, file);
}
