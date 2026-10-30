import { readFileSync } from 'node:fs';

export const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
