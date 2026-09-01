import fs from 'node:fs';
import path from 'node:path';
import { object, readJson } from './lib/storage.mjs';

let cached;

function registry(root) {
  if (cached?.root === root) return cached.value;
  const file = path.join(root, 'capabilities/registry.json');
  const value = readJson(file, 'Capability registry');
  if (value.schema_version !== 1 || !Array.isArray(value.capabilities)) throw new Error('Capability registry 契约非法');
  const map = new Map();
  for (const capability of value.capabilities) {
    if (!object(capability) || !/^[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/.test(capability.id ?? '')) throw new Error('Capability id 非法');
    if (map.has(capability.id)) throw new Error(`Capability 重复：${capability.id}`);
    map.set(capability.id, capability);
  }
  cached = { root, value: map };
  return map;
}

export function resolveCapability(root, id) {
  const capability = registry(root).get(id);
  if (!capability) throw new Error(`Capability 未注册：${id}`);
  return capability;
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
