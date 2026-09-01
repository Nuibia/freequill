#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRun, listRuntime, loadJsonInput, nextRun, observeRun, resumeRun, startRun, statusRun, submitRun } from '../runtime/lib/engine.mjs';
import { ensureUserSpace, resolveUserSpace } from '../runtime/user-space.mjs';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function parse(argv) {
  const command = argv.shift(); const options = {};
  while (argv.length) { const arg = argv.shift(); if (arg === '--json' || arg === '--completable') options[arg.slice(2).replaceAll('-', '_')] = true; else if (arg.startsWith('--')) { const value = argv.shift(); if (value == null || value.startsWith('--')) throw new Error(`${arg} 缺少值`); options[arg.slice(2).replaceAll('-', '_')] = value; } else throw new Error(`未知参数：${arg}`); }
  return { command, options };
}
function required(options, key) { if (!options[key]) throw new Error(`缺少 --${key.replaceAll("_", "-")}`); return options[key]; }
function jsonFile(file) { return loadJsonInput(path.resolve(process.cwd(), file)); }
export function main(argv = process.argv.slice(2)) {
  const { command, options } = parse([...argv]);
  const userSpace = command === 'start' ? ensureUserSpace() : resolveUserSpace();
  const stateDir = options.state_dir ? path.resolve(process.cwd(), options.state_dir) : userSpace.stateDir;
  const common = { root: SKILL_ROOT, stateDir };
  if (command === 'start') { const input = jsonFile(required(options, 'input')); return startRun({ ...common, workflow: required(options, 'workflow'), input, runId: options.run_id ?? null, accessGrant: input.authorization ?? {}, requestedBy: input.requested_by ?? {} }); }
  if (command === 'next') return nextRun({ ...common, runId: required(options, 'run_id'), instanceId: options.instance_id ?? null });
  if (command === 'resume') return resumeRun({ ...common, runId: required(options, 'run_id') });
  if (command === 'observe') return observeRun({ ...common, runId: required(options, 'run_id'), actionId: required(options, 'action_id'), event: jsonFile(required(options, 'file')) });
  if (command === 'submit') return submitRun({ ...common, runId: required(options, 'run_id'), actionId: required(options, 'action_id'), expectedRevision: Number(required(options, 'expected_revision')), result: jsonFile(required(options, 'file')) });
  if (command === 'status') return statusRun({ ...common, runId: required(options, 'run_id') });
  if (command === 'check') return checkRun({ ...common, runId: required(options, 'run_id'), completable: options.completable === true });
  if (command === 'list') return listRuntime(common);
  throw new Error('命令仅支持 start/next/resume/observe/submit/status/check/list');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) { try { const result = main(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.ok === false) process.exitCode = 1; } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
