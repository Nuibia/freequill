#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.schema_version, 1);
assert.equal(manifest.status, 'development');
assert.equal(manifest.sealed_holdout, false);
assert.equal(manifest.maturity_eligible, false);
assert.equal(sha256(fs.readFileSync(path.join(root, manifest.protocol))), manifest.protocol_sha256);
assert.equal(manifest.cases.length, 9);
const ids = new Set();
const genres = new Map([['XH', 'xuanhuan'], ['GY', 'guyan'], ['XY', 'xianyan']]);
for (const entry of manifest.cases) {
  assert.match(entry.blind_input_id, /^(XH|GY|XY)\d{3}$/u);
  assert.equal(ids.has(entry.blind_input_id), false);
  ids.add(entry.blind_input_id);
  const file = path.resolve(root, ...entry.path.split('/'));
  assert.equal(path.relative(root, file).startsWith('..'), false);
  const bytes = fs.readFileSync(file);
  assert.equal(sha256(bytes), entry.sha256);
  const input = JSON.parse(bytes.toString('utf8'));
  assert.equal(input.blind_input_id, entry.blind_input_id);
  assert.equal(input.contract.form, 'short');
  assert.equal(input.contract.genre, genres.get(entry.blind_input_id.slice(0, 2)));
  assert.ok(input.body.length >= 80);
  assert.doesNotMatch(bytes.toString('utf8'), /CRAFT-|expected_|期望判定|应抓出|坏例|好例|答案|oracle/iu);
}
assert.equal(fs.existsSync(path.join(root, 'oracle.json')), false);
assert.equal(fs.existsSync(path.join(root, 'results')), false);
process.stdout.write('FreeQuill genre semantic suite structure pass\n');
