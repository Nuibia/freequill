#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
let presentationFile = path.join(root, 'runtime/user-presentation.mjs');
let temporaryPackage = null;
if (!fs.lstatSync(path.join(root, 'runtime/lib/host-loop.mjs'), { throwIfNoEntry: false })?.isFile()) {
  const sourceRoot = path.resolve(root, '../..');
  const { buildPublicSkillPackage } = await import(pathToFileURL(path.join(sourceRoot, 'tools/build-public-skill-package.mjs')).href);
  temporaryPackage = fs.mkdtempSync(path.join(os.tmpdir(), 'freequill-output-first-source-test-'));
  const packageRoot = path.join(temporaryPackage, 'freequill-creation-suite');
  buildPublicSkillPackage({ skillName: 'freequill-creation-suite', outputRoot: packageRoot, sourceRoot, smoke: false });
  presentationFile = path.join(packageRoot, 'runtime/user-presentation.mjs');
}
const { presentRuntimeFailure, presentRuntimeState } = await import(`${pathToFileURL(presentationFile).href}?source-test=1`);
const packageRoot = path.resolve(path.dirname(presentationFile), '..');
const { createArtifact, createRunDirectories, runtimePaths } = await import(`${pathToFileURL(path.join(packageRoot, 'runtime/lib/storage.mjs')).href}?source-test=1`);
const contract = JSON.parse(fs.readFileSync(path.join(root, 'references/user-experience-contract.json'), 'utf8'));

function visibleCopy(result) {
  return [
    result.message,
    result.question,
    ...(result.delivery?.next_options ?? []),
  ].filter(Boolean).join('\n');
}

function assertNoInternalTerms(result) {
  const copy = visibleCopy(result);
  for (const term of contract.hidden_terms) assert.equal(copy.includes(term), false, `默认用户文案泄漏内部术语：${term}`);
  assert.equal(Object.hasOwn(result, 'developer_diagnostics'), false);
}

const working = presentRuntimeState({ status: 'running', pending_action: { capability: 'draft-short-story@1' } });
assert.equal(working.state, 'working');
assert.match(working.message, /写作/u);
assertNoInternalTerms(working);

const question = presentRuntimeState({ status: 'needs_input', needs_input: { required: ['genre'], reason: 'Context Composer 缺少 L2' } });
assert.equal(question.state, 'question');
assert.match(question.question, /都市脑洞/u);
assertNoInternalTerms(question);

const stopped = presentRuntimeState({ status: 'blocked', blocked: { reason: '三层 Context 冲突', node_id: 'context-gate' } });
assert.equal(stopped.state, 'cannot_continue');
assert.match(stopped.message, /设定互相冲突/u);
assertNoInternalTerms(stopped);

const qualityStopped = presentRuntimeState({ status: 'blocked', blocked: { reason: '短篇三轮隔离验稿后仍未通过' } });
assert.equal(qualityStopped.state, 'cannot_continue');
assert.match(qualityStopped.message, /没有达到可交付标准/u);
assert.doesNotMatch(qualityStopped.message, /环境/u);
assertNoInternalTerms(qualityStopped);

const failed = presentRuntimeFailure(new Error('Capability executor failed; run_id=secret'));
assert.equal(failed.state, 'problem');
assertNoInternalTerms(failed);

const diagnostics = presentRuntimeState({ status: 'blocked', blocked: { reason: '诊断详情' }, run_id: 'diagnostic-run' }, { diagnosticsRequested: true });
assert.equal(diagnostics.developer_diagnostics.run_id, 'diagnostic-run');

const journeyRoot = fs.mkdtempSync(path.join(process.cwd(), '.freequill-output-first-success-'));
const stateDir = path.join(journeyRoot, '.state');
const paths = runtimePaths(journeyRoot, 'output-first-recovery', stateDir);
createRunDirectories(paths);
const bookPath = path.join(journeyRoot, '我的作品', '匿名故事');
const delivery = createArtifact(paths, {
  type: 'fast-short-delivery',
  producer: { workflow: 'fast-short@2', instance_id: 'i-fixture', node_id: 'deliver' },
  payload: {
    book_path: bookPath,
    topic_package: { title: { selection: { candidate: { title: '匿名故事' } } } },
    story: { draft: { chapters: [{ number: 1, title: '第一章', content: '这是匿名测试正文。' }] } },
    submission: { materialization: { files: [path.join(bookPath, '投稿物料.md')] } },
  },
});
const completed = presentRuntimeState({ status: 'completed', root_artifact_ref: delivery.ref }, { root: journeyRoot, stateDir });
assert.equal(completed.state, 'done');
assert.equal(completed.delivery.title, '匿名故事');
assert.equal(completed.delivery.story.chapters[0].content, '这是匿名测试正文。');
assert.equal(completed.delivery.saved_at, bookPath);
assertNoInternalTerms(completed);

const recovered = presentRuntimeState({ status: 'completed', root_artifact_ref: delivery.ref, recovered_from: 'blocked' }, { root: journeyRoot, stateDir });
assert.equal(recovered.state, 'done');
assert.deepEqual(recovered.delivery, completed.delivery);
assertNoInternalTerms(recovered);

const incompleteCompletion = presentRuntimeState({ status: 'completed', root_artifact_ref: null }, { root: journeyRoot, stateDir });
assert.equal(incompleteCompletion.state, 'problem');
assert.equal(Object.hasOwn(incompleteCompletion, 'delivery'), false);
assertNoInternalTerms(incompleteCompletion);

process.stdout.write('FreeQuill output-first user view pass\n');
fs.rmSync(journeyRoot, { recursive: true, force: true });
if (temporaryPackage) fs.rmSync(temporaryPackage, { recursive: true, force: true });
