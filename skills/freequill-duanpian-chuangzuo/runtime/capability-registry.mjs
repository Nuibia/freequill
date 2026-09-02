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
