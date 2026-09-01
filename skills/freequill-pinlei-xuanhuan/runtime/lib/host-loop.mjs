import { nextRun, observeRun, startRun, statusRun, submitRun } from './engine.mjs';

function isoNow() { return new Date().toISOString(); }

function normalizeResult(raw, { startedAt, completedAt }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Host executor 必须返回 action result object');
  return {
    ...raw,
    telemetry: raw.telemetry ?? {
      started_at: startedAt,
      completed_at: completedAt,
      usage: { status: 'unavailable', reason: '当前 Host executor 未暴露可复核 Token 计数' },
    },
  };
}
/**
 * Host 侧唯一执行循环。仓库 Runtime 不调用模型；调用方注入 execute(action)，
 * Host 完成 Capability/隔离 Agent 后，循环统一 observe + submit 推进状态。
 */
export async function runHostLoop({
  root = process.cwd(),
  stateDir = null,
  start = null,
  runId = null,
  execute,
  maxActions = 200,
} = {}) {
  if (typeof execute !== 'function') throw new Error('runHostLoop 缺少 Host execute(action)');
  let current = start
    ? startRun({ root, stateDir, ...start })
    : statusRun({ root, stateDir, runId });
  let actionCount = 0;
  while (current.status === 'running') {
    if (!current.pending_action) {
      current = nextRun({ root, stateDir, runId: current.run_id });
      continue;
    }
    if (++actionCount > maxActions) throw new Error(`Host 循环超过 ${maxActions} 个 action，停止以防失控`);
    const action = current.pending_action;
    const startedAt = isoNow();
    observeRun({
      root, stateDir, runId: current.run_id, actionId: action.action_id,
      event: { phase: 'dispatched', action_type: action.action_type, capability: action.capability, executor_isolation_required: action.isolation?.required === true },
    });
    let raw;
    try {
      raw = await execute(action, { run_id: current.run_id, revision: current.revision, root, state_dir: stateDir });
    } catch (error) {
      observeRun({
        root, stateDir, runId: current.run_id, actionId: action.action_id,
        event: { phase: 'executor_failed', message: error.message },
      });
      throw error;
    }
    const result = normalizeResult(raw, { startedAt, completedAt: isoNow() });
    observeRun({
      root, stateDir, runId: current.run_id, actionId: action.action_id,
      event: { phase: 'executor_completed', status: result.status, executor: result.executor ?? null, telemetry: result.telemetry },
    });
    current = submitRun({
      root,
      stateDir,
      runId: current.run_id,
      actionId: action.action_id,
      expectedRevision: current.revision,
      result,
    });
  }
  return { ...current, action_count: actionCount };
}
