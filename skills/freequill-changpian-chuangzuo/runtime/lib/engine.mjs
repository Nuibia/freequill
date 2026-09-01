import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendJsonLine,
  atomicWriteJson,
  canonicalJson,
  commitState,
  createArtifact,
  createRunDirectories,
  listRunIds,
  loadArtifact,
  loadRunFiles,
  object,
  jsonBytes,
  readJson,
  runtimePaths,
  sha256,
  validateEvidenceRefs,
  withRunLock,
} from './storage.mjs';
import { getWorkflow, listWorkflows } from '../registry.mjs';
import { resolveCapability, validatePolicyRefs } from '../capability-registry.mjs';

const TERMINAL = new Set(['completed', 'blocked', 'failed']);
const ACTION_STATUS = new Set(['completed', 'blocked']);

function now() { return new Date().toISOString(); }

function makeRunId(workflowId) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14).toLowerCase();
  return `${workflowId}-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function makeInstance(definition, input, { parentInstanceId = null, mode = 'classic' } = {}) {
  const instanceId = `i-${crypto.randomBytes(6).toString('hex')}`;
  return {
    instance_id: instanceId,
    workflow: `${definition.id}@${definition.version}`,
    parent_instance_id: parentInstanceId,
    status: 'running',
    waiting_child_instance_id: null,
    output_artifact_ref: null,
    created_at: now(),
    updated_at: now(),
    data: definition.initialize({ input, mode }),
  };
}

function publicAction(action) {
  if (!action) return null;
  const copy = structuredClone(action);
  delete copy.internal;
  return copy;
}

function response(manifest, state, extra = {}) {
  return {
    ok: true,
    run_id: state.run_id,
    workflow: manifest.workflow,
    status: state.status,
    revision: state.revision,
    active_instance_id: state.active_instance_id,
    pending_action: publicAction(state.pending_action),
    root_artifact_ref: state.root_artifact_ref,
    ...extra,
  };
}

function ensureSideEffects(manifest, requested) {
  const allowed = new Set(manifest.authorization?.allowed_side_effects ?? []);
  const missing = requested.filter((item) => !allowed.has(item));
  if (missing.length) throw new Error(`Workflow 请求未授权 side effect：${missing.join(', ')}`);
}

function instanceDefinition(instance) { return getWorkflow(instance.workflow); }

function applyNodeResult(instance, nodeId, output, artifactRef, execution = null) {
  instanceDefinition(instance).apply(instance, { nodeId, output, artifactRef });
  if (execution) instance.data.results[nodeId].execution = structuredClone(execution);
  instance.updated_at = now();
}

function completeInstance(paths, state, instance, definition, payload) {
  const created = createArtifact(paths, {
    type: definition.outputArtifactType,
    payload,
    producer: { workflow: instance.workflow, instance_id: instance.instance_id },
  });
  instance.status = 'completed';
  instance.output_artifact_ref = created.ref;
  instance.updated_at = now();
  if (instance.parent_instance_id) {
    const parent = state.instances[instance.parent_instance_id];
    if (!parent || parent.waiting_child_instance_id !== instance.instance_id) throw new Error('子 Workflow 父实例绑定漂移');
    const parentDefinition = instanceDefinition(parent);
    const step = parentDefinition.next(parent);
    if (step.kind !== 'subworkflow') throw new Error('父 Workflow 当前节点不是 subworkflow');
    applyNodeResult(parent, step.id, created.artifact.payload, created.ref);
    parent.waiting_child_instance_id = null;
    state.active_instance_id = parent.instance_id;
  } else {
    state.status = 'completed';
    state.root_artifact_ref = created.ref;
    state.active_instance_id = null;
  }
  return created;
}

function blockState(state, reason, details = null, retry = null) {
  state.status = 'blocked';
  state.blocked = {
    reason,
    details,
    at: now(),
    retryable: retry?.retryable === true,
    ...(retry?.instanceId ? { instance_id: retry.instanceId } : {}),
    ...(retry?.nodeId ? { node_id: retry.nodeId } : {}),
  };
  state.pending_action = null;
}

function drive(root, paths, manifest, state) {
  let guard = 0;
  while (state.status === 'running' && !state.pending_action) {
    if (++guard > 200) throw new Error('Workflow 内部推进超过 200 步，疑似死循环');
    const instance = state.instances[state.active_instance_id];
    if (!instance || instance.status !== 'running') throw new Error('active instance 无效');
    const definition = instanceDefinition(instance);
    const step = definition.next(instance);
    if (step.kind === 'complete') {
      completeInstance(paths, state, instance, definition, step.payload);
      continue;
    }
    if (step.kind === 'subworkflow') {
      const childDefinition = getWorkflow(step.workflow);
      const child = makeInstance(childDefinition, step.input, {
        parentInstanceId: instance.instance_id,
        mode: step.input.mode ?? instance.data.mode,
      });
      state.instances[child.instance_id] = child;
      instance.waiting_child_instance_id = child.instance_id;
      state.active_instance_id = child.instance_id;
      continue;
    }
    if (step.kind === 'deterministic') {
      ensureSideEffects(manifest, step.allowedSideEffects);
      if (typeof step.run !== 'function') throw new Error(`${instance.workflow}/${step.id} 缺少确定性 handler`);
      const output = step.run({
        root,
        input: step.input,
        runId: state.run_id,
        manifest,
        state,
        stateDir: paths.base,
      });
      if (object(output) && output.status === 'needs_input') {
        state.status = 'needs_input';
        state.needs_input = { instance_id: instance.instance_id, node_id: step.id, ...output };
        break;
      }
      if (object(output) && output.status === 'blocked') {
        blockState(state, output.reason ?? `${step.id} 被确定性闸门拦截`, output.details ?? null, {
          retryable: true,
          instanceId: instance.instance_id,
          nodeId: step.id,
        });
        break;
      }
      let artifactRef = null;
      if (step.outputArtifactType) artifactRef = createArtifact(paths, {
        type: step.outputArtifactType,
        payload: output,
        producer: { workflow: instance.workflow, instance_id: instance.instance_id, node_id: step.id, deterministic: true },
      }).ref;
      applyNodeResult(instance, step.id, output, artifactRef);
      continue;
    }
    if (step.kind === 'checkpoint') {
      applyNodeResult(instance, step.id, { checkpoint: true }, null);
      state.checkpoint = { instance_id: instance.instance_id, node_id: step.id, at: now() };
      break;
    }
    if (!['capability', 'human_input'].includes(step.kind)) throw new Error(`未知节点类型：${step.kind}`);
    ensureSideEffects(manifest, step.allowedSideEffects);
    let capabilityContract = null;
    if (step.kind === 'capability') {
      capabilityContract = resolveCapability(root, step.capability);
      validatePolicyRefs(root, step.policyRefs);
    }
    state.pending_action = {
      action_id: `a-${crypto.randomBytes(8).toString('hex')}`,
      action_type: step.kind,
      run_id: state.run_id,
      instance_id: instance.instance_id,
      workflow: instance.workflow,
      node_id: step.id,
      capability: step.capability ?? null,
      capability_contract: capabilityContract,
      input: step.input,
      policy_refs: step.policyRefs,
      required_output_artifact_type: step.outputArtifactType ?? null,
      isolation: step.isolation,
      allowed_side_effects: step.allowedSideEffects,
      required_fields: step.required,
      prompt: step.prompt,
      expected_revision: state.revision + 1,
      created_at: now(),
      internal: { outputArtifactType: step.outputArtifactType ?? null },
    };
  }
  return state;
}

export function startRun({ root = process.cwd(), stateDir = null, workflow, input, runId = null, accessGrant = {}, requestedBy = {} }) {
  const definition = getWorkflow(workflow);
  const id = runId ?? makeRunId(definition.id);
  const paths = runtimePaths(root, id, stateDir);
  createRunDirectories(paths);
  const createdAt = now();
  const rootInstance = makeInstance(definition, input, { mode: input.mode ?? 'classic' });
  let authorizationBinding = null;
  if (accessGrant.evidence != null || accessGrant.kind != null || accessGrant.scope != null) {
    const expectedPrefix = accessGrant.kind === 'active-goal' ? 'goal:' : 'user:';
    if (!['user-request', 'active-goal'].includes(accessGrant.kind)) throw new Error('Runtime accessGrant.kind 必须是 user-request 或 active-goal');
    if (typeof accessGrant.evidence !== 'string' || !accessGrant.evidence.startsWith(expectedPrefix) || accessGrant.evidence.trim().length < 16) {
      throw new Error(`Runtime accessGrant.evidence 必须以 ${expectedPrefix} 开头并保留真实授权原文`);
    }
    if (typeof accessGrant.scope !== 'string' || accessGrant.scope.trim().length < 12) throw new Error('Runtime accessGrant.scope 至少 12 字');
    const receipt = {
      schema_version: 1,
      receipt_type: 'runtime-v2-authorization',
      run_id: id,
      kind: accessGrant.kind,
      evidence: accessGrant.evidence,
      evidence_sha256: sha256(accessGrant.evidence),
      scope: accessGrant.scope.trim(),
      recorded_at: createdAt,
    };
    atomicWriteJson(paths.authorizationFile, receipt, { mustNotExist: true });
    authorizationBinding = {
      kind: receipt.kind,
      scope: receipt.scope,
      evidence_sha256: receipt.evidence_sha256,
      receipt_ref: path.relative(paths.base, paths.authorizationFile).split(path.sep).join('/'),
      receipt_sha256: sha256(jsonBytes(receipt)),
    };
  }
  const manifest = {
    schema_version: 2,
    run_id: id,
    workflow: `${definition.id}@${definition.version}`,
    created_at: createdAt,
    repository_root: '.',
    ['authorization']: {
      allowed_side_effects: [...new Set(accessGrant.allowed_side_effects ?? [])].sort(),
      ...(authorizationBinding ?? {}),
    },
    requested_by: requestedBy,
    input_sha256: sha256(canonicalJson(input)),
  };
  let state = {
    schema_version: 2,
    run_id: id,
    revision: 0,
    status: 'running',
    root_instance_id: rootInstance.instance_id,
    active_instance_id: rootInstance.instance_id,
    pending_action: null,
    root_artifact_ref: null,
    blocked: null,
    needs_input: null,
    completed_actions: {},
    instances: { [rootInstance.instance_id]: rootInstance },
    created_at: createdAt,
    updated_at: createdAt,
  };
  atomicWriteJson(paths.manifestFile, manifest, { mustNotExist: true });
  atomicWriteJson(paths.stateFile, state, { mustNotExist: true });
  fs.writeFileSync(paths.eventsFile, '');
  state = drive(root, paths, manifest, state);
  state = commitState(paths, state, { event_type: 'run.started', workflow: manifest.workflow });
  if (state.pending_action) state.pending_action.expected_revision = state.revision;
  atomicWriteJson(paths.stateFile, state);
  return response(manifest, state, { manifest_file: paths.manifestFile });
}

export function nextRun({ root = process.cwd(), stateDir = null, runId, instanceId = null }) {
  const paths = runtimePaths(root, runId, stateDir);
  return withRunLock(paths, () => {
    const { manifest, state: loaded } = loadRunFiles(paths);
    let state = loaded;
    if (instanceId && state.active_instance_id !== instanceId && state.pending_action?.instance_id !== instanceId) {
      throw new Error(`instance-id 不是当前可推进实例：${instanceId}`);
    }
    if (TERMINAL.has(state.status) || state.pending_action || state.status === 'needs_input') return response(manifest, state, { needs_input: state.needs_input });
    state.checkpoint = null;
    state = drive(root, paths, manifest, state);
    state = commitState(paths, state, { event_type: 'run.advanced' });
    if (state.pending_action) state.pending_action.expected_revision = state.revision;
    atomicWriteJson(paths.stateFile, state);
    return response(manifest, state, { needs_input: state.needs_input });
  });
}

export function resumeRun({ root = process.cwd(), stateDir = null, runId }) {
  const paths = runtimePaths(root, runId, stateDir);
  return withRunLock(paths, () => {
    const { manifest, state: loaded } = loadRunFiles(paths);
    let state = loaded;
    if (state.status !== 'blocked') {
      return response(manifest, state, { blocked: state.blocked, resumed: false });
    }
    const instanceId = state.blocked?.instance_id ?? state.active_instance_id;
    const instance = state.instances[instanceId];
    if (!instance || instance.status !== 'running' || state.active_instance_id !== instance.instance_id) {
      throw new Error('可恢复阻塞绑定的 Workflow 实例无效');
    }
    const definition = instanceDefinition(instance);
    const step = definition.next(instance);
    const legacyDeterministicBlock = !Object.hasOwn(state.blocked ?? {}, 'retryable') && step.kind === 'deterministic';
    if (state.blocked?.retryable !== true && !legacyDeterministicBlock) {
      return response(manifest, state, { blocked: state.blocked, resumed: false });
    }
    if (step.kind !== 'deterministic' || (state.blocked?.node_id && step.id !== state.blocked.node_id)) {
      throw new Error('可恢复阻塞绑定的确定性节点已漂移');
    }
    state.status = 'running';
    state.blocked = null;
    state.needs_input = null;
    state = drive(root, paths, manifest, state);
    state = commitState(paths, state, { event_type: 'run.resumed', instance_id: instance.instance_id, node_id: step.id });
    if (state.pending_action) state.pending_action.expected_revision = state.revision;
    atomicWriteJson(paths.stateFile, state);
    return response(manifest, state, { blocked: state.blocked, resumed: true });
  });
}

export function observeRun({ root = process.cwd(), stateDir = null, runId, actionId, event }) {
  const paths = runtimePaths(root, runId, stateDir);
  return withRunLock(paths, () => {
    const { manifest, state } = loadRunFiles(paths);
    if (state.pending_action?.action_id !== actionId && !state.completed_actions[actionId]) throw new Error('action-id 不属于当前 run');
    const traceFile = path.join(paths.traceDir, `${actionId}.jsonl`);
    appendJsonLine(traceFile, { schema_version: 1, observed_at: now(), action_id: actionId, event });
    return response(manifest, state, { observed: true, trace_file: traceFile });
  });
}

export function submitRun({ root = process.cwd(), stateDir = null, runId, actionId, expectedRevision, result }) {
  const paths = runtimePaths(root, runId, stateDir);
  return withRunLock(paths, () => {
    const { manifest, state: loaded } = loadRunFiles(paths);
    let state = loaded;
    const resultHash = sha256(canonicalJson(result));
    const completed = state.completed_actions[actionId];
    if (completed) {
      if (completed.result_sha256 !== resultHash) throw new Error('同一 action-id 已提交不同结果，拒绝非幂等重放');
      return response(manifest, state, { idempotent_replay: true });
    }
    const action = state.pending_action;
    if (!action || action.action_id !== actionId) throw new Error('action-id 不是当前待提交 action');
    if (state.revision !== expectedRevision) throw new Error(`revision 冲突：当前 ${state.revision}，提交 ${expectedRevision}`);
    if (!object(result) || !ACTION_STATUS.has(result.status)) throw new Error('result.status 只接受 completed 或 blocked');
    if (result.status === 'blocked') {
      state.completed_actions[actionId] = { result_sha256: resultHash, completed_at: now(), artifact_ref: null };
      blockState(state, result.reason ?? 'Capability 无法完成', result.details ?? null);
    } else {
      if (!object(result.output)) throw new Error('completed result.output 必须是对象');
      if (action.action_type === 'capability') {
        const capability = resolveCapability(root, action.capability);
        const missingFields = (capability.output_contract?.required ?? []).filter((key) => !(key in result.output));
        if (missingFields.length) throw new Error(`Capability 输出缺字段：${missingFields.join(', ')}`);
      }
      const sideEffects = result.side_effects ?? [];
      if (!Array.isArray(sideEffects)) throw new Error('side_effects 必须是数组');
      const unexpected = sideEffects.filter((item) => !action.allowed_side_effects.includes(item));
      if (unexpected.length) throw new Error(`Capability 回报了未声明 side effect：${unexpected.join(', ')}`);
      const evidenceRefs = validateEvidenceRefs(root, result.evidence_refs);
      if (action.isolation?.required) {
        const executor = result.executor;
        if (!object(executor) || executor.isolated !== true || typeof executor.agent_id !== 'string' || executor.agent_id.length < 1) {
          throw new Error('关键 Eval 必须提交 isolated executor.agent_id');
        }
        if (manifest.requested_by?.agent_id && executor.agent_id === manifest.requested_by.agent_id) {
          throw new Error('关键 Eval 不允许由发起 Agent 自评通过');
        }
      }
      const instance = state.instances[action.instance_id];
      let artifactRef = null;
      if (action.internal.outputArtifactType) artifactRef = createArtifact(paths, {
        type: action.internal.outputArtifactType,
        payload: result.output,
        producer: {
          workflow: action.workflow,
          instance_id: action.instance_id,
          node_id: action.node_id,
          capability: action.capability,
          executor: result.executor ?? null,
        },
        metadata: { evidence_refs: evidenceRefs },
      }).ref;
      const execution = {
        executor: result.executor ?? null,
        telemetry: result.telemetry ?? null,
        evidence_refs: evidenceRefs,
      };
      applyNodeResult(instance, action.node_id, result.output, artifactRef, execution);
      state.pending_action = null;
      state.status = 'running';
      state.needs_input = null;
      state.completed_actions[actionId] = {
        result_sha256: resultHash,
        completed_at: now(),
        artifact_ref: artifactRef,
        workflow: action.workflow,
        instance_id: action.instance_id,
        node_id: action.node_id,
        capability: action.capability,
        execution,
      };
      state = drive(root, paths, manifest, state);
    }
    state = commitState(paths, state, { event_type: 'action.submitted', action_id: actionId, result_sha256: resultHash });
    if (state.pending_action) state.pending_action.expected_revision = state.revision;
    atomicWriteJson(paths.stateFile, state);
    return response(manifest, state);
  });
}

export function statusRun({ root = process.cwd(), stateDir = null, runId }) {
  const paths = runtimePaths(root, runId, stateDir);
  const { manifest, state } = loadRunFiles(paths);
  return response(manifest, state, { manifest, instances: state.instances, blocked: state.blocked, needs_input: state.needs_input });
}

export function checkRun({ root = process.cwd(), stateDir = null, runId, completable = false }) {
  const paths = runtimePaths(root, runId, stateDir);
  const errors = [];
  let manifest;
  let state;
  try { ({ manifest, state } = loadRunFiles(paths)); } catch (error) { return { ok: false, run_id: runId, errors: [error.message] }; }
  if (manifest.schema_version !== 2 || state.schema_version !== 2) errors.push('仅检查 Runtime v2');
  if (manifest.run_id !== runId || state.run_id !== runId) errors.push('run_id 不一致');
  if (!state.instances[state.root_instance_id]) errors.push('root instance 缺失');
  if (state.root_artifact_ref) {
    try { loadArtifact(root, state.root_artifact_ref, stateDir); } catch (error) { errors.push(error.message); }
  }
  for (const instance of Object.values(state.instances)) {
    if (instance.output_artifact_ref) {
      try { loadArtifact(root, instance.output_artifact_ref, stateDir); } catch (error) { errors.push(error.message); }
    }
  }
  const lines = fs.existsSync(paths.eventsFile) ? fs.readFileSync(paths.eventsFile, 'utf8').trim().split('\n').filter(Boolean) : [];
  if (lines.length !== state.revision) errors.push(`events 数量 ${lines.length} 与 revision ${state.revision} 不一致`);
  if (lines.length) {
    try {
      const lastEvent = JSON.parse(lines.at(-1));
      const currentHash = sha256(canonicalJson(state));
      if (lastEvent.state_sha256 !== currentHash) errors.push('最后事件未绑定当前 state 哈希');
    } catch (error) {
      errors.push(`events.jsonl 末行非法：${error.message}`);
    }
  }
  if (completable && state.status !== 'completed') errors.push(`run 尚不可完成：${state.status}`);
  return { ok: errors.length === 0, run_id: runId, status: state.status, revision: state.revision, errors };
}

export function listRuntime({ root = process.cwd(), stateDir = null }) {
  const runs = listRunIds(root, stateDir).map((runId) => {
    try {
      const paths = runtimePaths(root, runId, stateDir);
      const { manifest, state } = loadRunFiles(paths);
      return { run_id: runId, workflow: manifest.workflow, status: state.status, revision: state.revision, updated_at: state.updated_at };
    } catch (error) {
      return { run_id: runId, status: 'invalid', error: error.message };
    }
  });
  return { ok: true, workflows: listWorkflows(), runs };
}

export function loadJsonInput(file) { return readJson(path.resolve(file), '输入 JSON'); }
