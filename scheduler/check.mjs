// Read-only by default. --dispatch uses the existing local gh login without printing its token.
import { execFileSync } from 'node:child_process';
import { checkUpdates } from './watchdog.mjs';

const dispatch = process.argv.includes('--dispatch');
if (process.argv.slice(2).some(arg => arg !== '--dispatch')) throw new Error('Usage: node scheduler/check.mjs [--dispatch]');
const token = dispatch ? process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() : undefined;
console.log(JSON.stringify(await checkUpdates({ token, dispatch }), null, 2));
