import fs from 'node:fs';
import path from 'node:path';
import { object, readJson } from './lib/storage.mjs';

let cached;

function registry(root) {
  if (cached?.root === root) return cached.value;
  const file = path.join(root, 'capabilities/registry.json');
  const value = readJson(file, 'Capability registry');
  if (![1, 2].includes(value.schema_version) || !Array.isArray(value.capabilities)) throw new Error('Capability registry 契约非法');
  const map = new Map();
  for (const capability of value.capabilities) {
    if (!object(capability) || !/^[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/.test(capability.id ?? '')) throw new Error('Capability id 非法');
    if (map.has(capability.id)) throw new Error(`Capability 重复：${capability.id}`);
    let resolved = capability;
    if (value.schema_version === 2) {
      const profile = value.context_profiles?.[capability.context_profile];
      if (!object(profile)) throw new Error(`Capability 缺少 Context profile：${capability.id}`);
      if (!object(capability.input_schema) || !object(capability.output_schema)) throw new Error(`Capability v2 缺输入/输出 Schema：${capability.id}`);
      resolved = { ...capability, contract_schema_version: 2, context_contract: profile };
    }
    map.set(capability.id, resolved);
  }
  cached = { root, value: map };
  return map;
}

export function resolveCapability(root, id) {
  const capability = registry(root).get(id);
  if (!capability) throw new Error(`Capability 未注册：${id}`);
  return capability;
}

export function validateCapabilityInput(capability, input) {
  const required = capability?.input_schema?.required ?? [];
  if (!Array.isArray(required)) throw new Error(`Capability input_schema.required 非法：${capability?.id ?? '?'}`);
  if (!object(input)) return required;
  return required.filter((key) => !Object.hasOwn(input, key) || input[key] == null);
}

function typeMatches(type, value) {
  if (type === 'object') return object(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
}

function schemaAllowsNull(schema) {
  return Array.isArray(schema?.enum) && schema.enum.some((item) => item === null);
}

function validateSchema(schema, value, location, errors) {
  if (!object(schema)) return;
  if (typeof schema.type === 'string' && !typeMatches(schema.type, value)) {
    errors.push(`${location} 必须是 ${schema.type}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) errors.push(`${location} 不在允许值内`);
  if (typeof value === 'string' && Number.isInteger(schema.minLength) && value.length < schema.minLength) errors.push(`${location} 长度不足 ${schema.minLength}`);
  if (typeof value === 'number' && Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${location} 小于 ${schema.minimum}`);
  if (typeof value === 'number' && Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${location} 大于 ${schema.maximum}`);
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push(`${location} 至少需要 ${schema.minItems} 项`);
    if (object(schema.items)) value.forEach((item, index) => validateSchema(schema.items, item, `${location}[${index}]`, errors));
  }
  if (object(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        const missing = !Object.hasOwn(value, key);
        const nullNotAllowed = value[key] == null && !schemaAllowsNull(schema.properties?.[key]);
        if (missing || nullNotAllowed) errors.push(`${location}.${key} 缺失`);
      }
    }
    if (object(schema.properties)) {
      for (const [key, child] of Object.entries(schema.properties)) if (Object.hasOwn(value, key) && value[key] != null) validateSchema(child, value[key], `${location}.${key}`, errors);
    }
  }
}

function chapterText(payload) {
  if (!Array.isArray(payload?.chapters)) return '';
  return payload.chapters.map((chapter) => chapter?.content ?? chapter?.body ?? '').filter((item) => typeof item === 'string').join('\n\n');
}

function validateRevisionResolutionEvidence(capability, output, input, errors) {
  if (capability?.output_contract?.validation_profile !== 'revision-resolution-evidence-v1') return;
  const required = input?.required_resolutions;
  const report = output?.resolution_report;
  if (!Array.isArray(required) || !Array.isArray(report)) return;
  const expectedIds = required.map((item) => item?.finding_id).filter((item) => typeof item === 'string');
  const reportIds = report.map((item) => item?.finding_id).filter((item) => typeof item === 'string');
  const duplicates = reportIds.filter((id, index) => reportIds.indexOf(id) !== index);
  for (const id of new Set(duplicates)) errors.push(`output.resolution_report 重复 finding_id：${id}`);
  for (const id of expectedIds) if (!reportIds.includes(id)) errors.push(`output.resolution_report 缺少 ${id}`);
  for (const id of reportIds) if (!expectedIds.includes(id)) errors.push(`output.resolution_report 含未知 finding_id：${id}`);
  const beforeBody = chapterText(input?.draft);
  const afterBody = chapterText(output);
  for (const [index, item] of report.entries()) {
    if (!object(item)) continue;
    const location = `output.resolution_report[${index}]`;
    const before = typeof item.before_evidence === 'string' ? item.before_evidence.trim() : '';
    const after = typeof item.after_evidence === 'string' ? item.after_evidence.trim() : '';
    if (before.length > 240) errors.push(`${location}.before_evidence 不得超过 240 字`);
    if (after.length > 240) errors.push(`${location}.after_evidence 不得超过 240 字`);
    if (after && !afterBody.includes(after)) errors.push(`${location}.after_evidence 不在返修后正文中`);
    if (['replace', 'delete'].includes(item.change_type)) {
      if (!before) errors.push(`${location}.before_evidence 缺失`);
      else {
        if (!beforeBody.includes(before)) errors.push(`${location}.before_evidence 不在当前底稿中`);
        if (afterBody.includes(before)) errors.push(`${location}.before_evidence 仍残留在返修后正文中`);
      }
      if (before && after && before === after) errors.push(`${location} 前后证据不能相同`);
    }
    if (item.change_type === 'insert' && after && beforeBody.includes(after)) errors.push(`${location}.after_evidence 在当前底稿中已存在，不能声明为 insert`);
    if (item.change_type === 'confirm' && after && !beforeBody.includes(after)) errors.push(`${location}.after_evidence 不在当前底稿中，不能声明为 confirm`);
  }
}

function validateBookContextBinding(capability, output, input, errors) {
  if (capability?.output_contract?.validation_profile !== 'book-context-binding-v1') return;
  const policy = output?.book_policy;
  const binding = input?.l2_binding;
  if (!object(policy) || !object(binding)) return;
  if (policy.status !== 'configured') errors.push('output.book_policy.status 必须是 configured');
  if (policy.core_emotion !== binding.core_emotion) errors.push('output.book_policy.core_emotion 必须逐字继承 input.l2_binding.core_emotion');
  if (policy.inherits?.l1_version !== binding.l1_version) errors.push('output.book_policy.inherits.l1_version 必须逐字继承 input.l2_binding.l1_version');
  if (policy.inherits?.l2_genre !== binding.l2_genre || policy.inherits?.l2_genre !== input?.genre) errors.push('output.book_policy.inherits.l2_genre 必须与当前品类一致');
  if (policy.inherits?.l2_version !== binding.l2_version) errors.push('output.book_policy.inherits.l2_version 必须逐字继承 input.l2_binding.l2_version');
  if (Object.hasOwn(policy, 'red_lines_removed') || Object.hasOwn(policy, 'l2_red_lines')) errors.push('output.book_policy 不得删除或覆盖 L2 红线');
  if (output?.current_state?.canon_revision !== output?.canon_ledger?.revision) errors.push('output.current_state.canon_revision 必须等于 output.canon_ledger.revision');
}

function validatePlanFrozenConstraints(capability, output, input, errors) {
  if (capability?.output_contract?.validation_profile !== 'plan-frozen-constraints-v1') return;
  const required = input?.frozen_constraints;
  const checks = output?.constraint_checks;
  if (!Array.isArray(required) || !Array.isArray(checks)) return;
  const expectedIds = required.map((item) => item?.constraint_id).filter((item) => typeof item === 'string');
  const checkIds = checks.map((item) => item?.constraint_id).filter((item) => typeof item === 'string');
  const duplicates = checkIds.filter((id, index) => checkIds.indexOf(id) !== index);
  for (const id of new Set(duplicates)) errors.push(`output.constraint_checks 重复 constraint_id：${id}`);
  for (const id of expectedIds) if (!checkIds.includes(id)) errors.push(`output.constraint_checks 缺少 ${id}`);
  for (const id of checkIds) if (!expectedIds.includes(id)) errors.push(`output.constraint_checks 含未知 constraint_id：${id}`);
  if (output?.verdict === 'PASS') {
    for (const item of checks) if (item?.verdict !== 'PASS') errors.push(`output.verdict 为 PASS 时冻结约束 ${item?.constraint_id ?? '?'} 不得为 ${item?.verdict ?? '缺失'}`);
  }
}

export function normalizeCapabilityOutput(capability, output) {
  const aliases = capability?.output_contract?.accepted_legacy_aliases;
  if (!object(aliases) || !Array.isArray(output?.chapters)) return output;
  return {
    ...output,
    chapters: output.chapters.map((chapter) => {
      if (!object(chapter)) return chapter;
      const normalized = { ...chapter };
      for (const [canonical, legacy] of Object.entries(aliases)) {
        if (normalized[canonical] == null && normalized[legacy] != null) normalized[canonical] = normalized[legacy];
      }
      return normalized;
    }),
  };
}

export function validateCapabilityOutput(capability, output, input = null) {
  const errors = [];
  validateSchema(capability?.output_schema, output, 'output', errors);
  validateRevisionResolutionEvidence(capability, output, input, errors);
  validateBookContextBinding(capability, output, input, errors);
  validatePlanFrozenConstraints(capability, output, input, errors);
  return errors;
}

export function validatePolicyRefs(root, refs) {
  for (const ref of refs) {
    if (typeof ref !== 'string' || !ref.startsWith('policies/') || ref.includes('..') || !ref.endsWith('.json')) throw new Error(`Policy ref 非法：${String(ref)}`);
    const file = path.resolve(root, ref);
    const relative = path.relative(path.resolve(root, 'policies'), file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Policy ref 越界：${ref}`);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Policy 不可安全读取：${ref}`);
    const policy = readJson(file, 'Policy');
    if (!object(policy) || typeof policy.policy_id !== 'string') throw new Error(`Policy 缺少 policy_id：${ref}`);
  }
}
