import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function cleanHome(value) {
  if (typeof value !== 'string' || !value.trim() || /[\0\r\n]/u.test(value)) throw new Error('FreeQuill 用户空间路径非法');
  return path.resolve(value.trim());
}
function ensureDirectory(directory) {
  const existing = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error(`FreeQuill 用户空间目录不安全：${directory}`);
  if (!existing) fs.mkdirSync(directory, { recursive: true });
  const created = fs.lstatSync(directory);
  if (!created.isDirectory() || created.isSymbolicLink()) throw new Error(`FreeQuill 用户空间目录不安全：${directory}`);
}
export function resolveFreequillHome({ env = process.env, homedir = os.homedir() } = {}) {
  return cleanHome(env.FREEQUILL_HOME ?? path.join(homedir, 'FreeQuill'));
}
export function resolveUserSpace(options = {}) {
  const home = options.home ? cleanHome(options.home) : resolveFreequillHome(options);
  return { home, worksDir: path.join(home, '我的作品'), stateDir: path.join(home, '.freequill', 'runtime-v2') };
}
export function ensureUserSpace(options = {}) {
  const resolved = resolveUserSpace(options);
  ensureDirectory(resolved.home);
  ensureDirectory(resolved.worksDir);
  ensureDirectory(path.dirname(resolved.stateDir));
  ensureDirectory(resolved.stateDir);
  return resolved;
}
