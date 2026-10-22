// Rebuilds the slice's geodata from data/raw into a temporary file and checks it matches the committed output
// (determinism, PLAN.md D13). Skips when the raw inputs (git-ignored, tools/fetch-geodata.mjs) are absent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hasRaw = fs.existsSync(path.join(root, 'data/raw/MANIFEST.json')) && fs.existsSync(path.join(root, 'tools/node_modules/geotiff'));

test('slice geodata rebuilds byte-identically from the raw data', { skip: !hasRaw && 'needs data/raw and tools/node_modules', timeout: 300000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-geodata-'));
  const out = path.join(dir, 'sf-geodata.js');
  execFileSync(process.execPath, ['--max-old-space-size=8192', path.join(root, 'tools/build-geodata.mjs'), 'slice', out], { cwd: root, stdio: 'pipe' });
  assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(path.join(root, 'js/sf-geodata.js'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
});
