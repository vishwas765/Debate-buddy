// Vercel serves this copied directory through its static CDN; API handlers live in /api.
import {cp, mkdir, rm} from 'node:fs/promises';

await rm('dist', {recursive: true, force: true});
await mkdir('dist', {recursive: true});
await cp('public', 'dist', {recursive: true});
console.log('Built Debate Buddy static site into dist/.');
