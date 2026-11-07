import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('all package executable JavaScript including tests lives under src', async () => {
  async function walk(dir) {
    const paths = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) paths.push(...await walk(full));
      else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) paths.push(path.relative(root, full));
    }
    return paths;
  }
  const files = await walk(root);
  assert.ok(files.length >= 7);
  assert.ok(files.every(name => name.startsWith(`src${path.sep}`)), files.join('\n'));
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.exports['.'], './src/index.js');
  assert.equal(manifest.exports['./client'], './src/client.js');
  assert.match(manifest.scripts.test, /src\/tests\//);
});

test('quota dock entry precedes activity statistics (turns/steps/speed) and usage without claiming full width', async () => {
  const source = await readFile(path.join(root, 'src/client.js'), 'utf8');
  const match = source.match(/register\('conversation\.composer\.dock',\{id:'local-llm-quota',order:(-?[\d.]+)\},Bar\)/);
  assert.ok(match);
  // activity (turns/steps/tok/s) is order 0; usage (tokens/cache/context) is order 1.
  // A value between 0 and 1 still leaves quotas to the RIGHT of session statistics.
  assert.ok(Number(match[1]) < 0, 'Quotas must precede activity at order 0, not merely usage at order 1');
  const rule = source.match(/\.dq-bar\{([^}]+)\}/)[1];
  assert.match(rule, /justify-content:flex-start/);
  assert.doesNotMatch(rule, /(?:^|;)width:100%/);
});
