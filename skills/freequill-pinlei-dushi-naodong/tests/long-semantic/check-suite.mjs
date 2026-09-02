#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.cases.length, 4);
assert.equal(sha(fs.readFileSync(path.join(root, manifest.protocol))), manifest.protocol_sha256);
for (const entry of manifest.cases) {
  const bytes = fs.readFileSync(path.join(root, entry.path));
  assert.equal(sha(bytes), entry.sha256);
  const value = JSON.parse(bytes);
  assert.equal(value.blind_input_id, entry.blind_input_id);
  assert.ok(value.body.length >= 80);
  assert.doesNotMatch(bytes.toString('utf8'), /CRAFT-|expected_|期望判定|应抓出|坏例|好例|答案|oracle/iu);
}
assert.equal(fs.existsSync(path.join(root, 'oracle.json')), false);
process.stdout.write('FreeQuill long semantic suite structure pass\n');
