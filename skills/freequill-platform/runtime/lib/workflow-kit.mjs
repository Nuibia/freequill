import { object } from './storage.mjs';

function resolveValue(value, context) {
  return typeof value === 'function' ? value(context) : structuredClone(value);
}

export function defineSequentialWorkflow({
  id,
  version,
  title,
  invocationModes = ['standalone', 'nested'],
  outputArtifactType,
  steps,
  complete,
}) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error(`${id}@${version} 缺少 steps`);
  return {
    id,
    version,
    title,
    invocationModes,
    outputArtifactType,
    initialize({ input, mode }) {
      if (!object(input)) throw new Error(`${id}@${version} input 必须是对象`);
      return { mode, input: structuredClone(input), cursor: 0, results: {}, skipped: [] };
    },
    next(instance) {
      const context = { input: instance.data.input, results: instance.data.results, mode: instance.data.mode };
      while (instance.data.cursor < steps.length) {
        const source = steps[instance.data.cursor];
        if (source.when && !source.when(context)) {
          instance.data.skipped.push(source.id);
          instance.data.cursor += 1;
          continue;
        }
        return {
          id: source.id,
          kind: source.kind,
          capability: source.capability,
          workflow: source.workflow,
          handler: source.handler,
          input: resolveValue(source.input ?? {}, context),
          policyRefs: resolveValue(source.policyRefs ?? [], context),
          outputArtifactType: source.outputArtifactType,
          isolation: resolveValue(source.isolation ?? null, context),
          allowedSideEffects: resolveValue(source.allowedSideEffects ?? [], context),
          required: resolveValue(source.required ?? [], context),
          prompt: resolveValue(source.prompt ?? null, context),
          run: source.run,
        };
      }
      return { id: 'complete', kind: 'complete', payload: complete(context) };
    },
    apply(instance, { nodeId, output, artifactRef }) {
      const expected = steps[instance.data.cursor];
      if (!expected || expected.id !== nodeId) throw new Error(`Workflow 游标漂移：期待 ${expected?.id ?? 'complete'}，收到 ${nodeId}`);
      instance.data.results[nodeId] = { output: structuredClone(output), artifact_ref: artifactRef ?? null };
      instance.data.cursor += 1;
    },
  };
}

export function resultExecution(results, key) {
  if (!object(results?.[key])) throw new Error(`缺少上游结果：${key}`);
  return results[key].execution ?? null;
}

export function resultOutput(results, key) {
  if (!object(results?.[key])) throw new Error(`缺少上游结果：${key}`);
  return results[key].output;
}
