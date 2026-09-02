import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureUserSpace } from './user-space.mjs';

const SAFE_SEGMENT = /^[^/\\\0\r\n]+$/u;

function ensureDirectory(directory) {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`用户内容目录不安全：${directory}`);
  if (!stat) fs.mkdirSync(directory, { recursive: true });
}

function safeTitle(value) {
  if (typeof value !== 'string' || !value.trim() || !SAFE_SEGMENT.test(value.trim()) || ['.', '..'].includes(value.trim())) {
    throw new Error('作品标题必须是安全的非空单层目录名');
  }
  return value.trim();
}

function inside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function lockPathFor(resolved) {
  const locks = path.join(resolved.stateDir, 'workspace-locks');
  ensureDirectory(locks);
  return path.join(locks, `${sha256(Buffer.from(resolved.bookPath))}.lock`);
}

export function withBookWriteLock(bookPath, callback, { userSpace = {} } = {}) {
  const resolved = resolveWork(bookPath, userSpace);
  const lockFile = lockPathFor(resolved);
  let descriptor;
  try {
    descriptor = fs.openSync(lockFile, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify({ schema_version: 1, book_path_sha256: sha256(Buffer.from(resolved.bookPath)), pid: process.pid, acquired_at: new Date().toISOString() })}\n`);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error.code === 'EEXIST') throw new Error(`作品已有写入事务正在执行；拒绝并发覆盖：${resolved.bookPath}`);
    throw error;
  }
  try {
    return callback(resolved);
  } finally {
    fs.closeSync(descriptor);
    fs.rmSync(lockFile, { force: true });
  }
}

function atomicWrite(file, bytes, { allowReplace = false } = {}) {
  ensureDirectory(path.dirname(file));
  const existing = fs.lstatSync(file, { throwIfNoEntry: false });
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error(`拒绝写入不安全文件：${file}`);
  if (existing && !allowReplace) {
    const current = fs.readFileSync(file);
    if (Buffer.compare(current, bytes) === 0) return;
    throw new Error(`拒绝覆盖已有用户内容：${file}`);
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`);
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

export function resolveWork(bookPath, options = {}) {
  const userSpace = ensureUserSpace(options);
  const absolute = path.isAbsolute(bookPath ?? '') ? path.resolve(bookPath) : path.resolve(userSpace.worksDir, bookPath ?? '');
  if (!inside(userSpace.worksDir, absolute) || absolute === path.resolve(userSpace.worksDir)) throw new Error('作品路径必须位于 FreeQuill/我的作品 内');
  return { ...userSpace, bookPath: absolute };
}

export function createWork({ title, form = 'short', genre = null, topicPackage = null, options = {} }) {
  const userSpace = ensureUserSpace(options);
  const normalizedTitle = safeTitle(title);
  if (!['short', 'long'].includes(form)) throw new Error('form 只支持 short 或 long');
  const bookPath = path.join(userSpace.worksDir, normalizedTitle);
  const existing = fs.lstatSync(bookPath, { throwIfNoEntry: false });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error(`作品路径不安全：${bookPath}`);
  if (!existing) fs.mkdirSync(bookPath);
  for (const directory of ['正文', '设定']) ensureDirectory(path.join(bookPath, directory));
  const metadata = {
    schema_version: 1,
    product: 'freequill',
    title: normalizedTitle,
    form,
    genre,
    created_at: new Date().toISOString(),
    topic_package: topicPackage,
    l3_status: 'needs_configuration',
  };
  const marker = path.join(bookPath, '.freequill-work.json');
  if (!fs.existsSync(marker)) atomicWrite(marker, Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`));
  const readme = path.join(bookPath, 'README.md');
  if (!fs.existsSync(readme)) atomicWrite(readme, Buffer.from(`# ${normalizedTitle}\n\n由 FreeQuill 管理的${form === 'short' ? '短篇' : '长篇'}创作空间。\n`));
  const progress = path.join(bookPath, '连载进度.md');
  if (!fs.existsSync(progress)) atomicWrite(progress, Buffer.from(`# 创作进度\n\n- 状态：已创建\n`));
  return { book_path: bookPath, title: normalizedTitle, form };
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value;
}

export function materializeBookContext({ root, bookPath, genre, context, sourceBundleSha256 }) {
  const resolved = resolveWork(bookPath);
  const l2File = path.resolve(root, `references/craft/rules/l2-${genre}.json`);
  const l2 = JSON.parse(fs.readFileSync(l2File, 'utf8'));
  const required = {
    book_policy: '设定/book-policy.json',
    story_bible: '设定/故事圣经.json',
    character_dialogue: '设定/人物与对白卡.json',
    creation_decisions: '设定/创作决策记录.json',
    canon_ledger: '设定/正史账.json',
    current_state: '设定/state/current_state.json',
    chapter_snapshot: '设定/state/chapter-snapshots/0000.json',
  };
  for (const key of Object.keys(required)) requireObject(context?.[key], key);
  const policy = context.book_policy;
  if (policy.status !== 'configured') throw new Error('book_policy.status 必须是 configured');
  if (policy.inherits?.l2_genre !== genre) throw new Error('book_policy 品类继承不一致');
  if (policy.core_emotion !== l2.core_emotion) throw new Error('L3 不得重定义 L2 核心情绪');
  if (!Array.isArray(policy.red_lines_additions) || Object.hasOwn(policy, 'red_lines_removed') || Object.hasOwn(policy, 'l2_red_lines')) throw new Error('L3 只能追加书级红线');
  if (context.current_state.canon_revision !== context.canon_ledger.revision) throw new Error('current_state 必须绑定当前正史 revision');
  const normalized = structuredClone(context);
  normalized.book_policy.integrity = { frozen: true, source_bundle_sha256: sourceBundleSha256 };
  const markerFile = path.join(resolved.bookPath, '.freequill-work.json');
  const markerBytes = fs.readFileSync(markerFile);
  const marker = JSON.parse(markerBytes.toString('utf8'));
  writeWorkBatch(resolved.bookPath, [
    ...Object.entries(required).map(([key, relative]) => ({
      relative,
      content: `${JSON.stringify(normalized[key], null, 2)}\n`,
      expected_exists: false,
    })),
    {
      relative: '.freequill-work.json',
      content: `${JSON.stringify({ ...marker, genre, l3_status: 'configured' }, null, 2)}\n`,
      allowReplace: true,
      expected_exists: true,
      expected_sha256: sha256(markerBytes),
    },
  ]);
  return { written: true, book_path: resolved.bookPath, genre, l3_refs: Object.values(required) };
}

export function writeWorkJson(bookPath, relative, value, options = {}) {
  return writeWorkFile(bookPath, relative, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function writeWorkFile(bookPath, relative, content, { allowReplace = false, userSpace = {} } = {}) {
  const resolved = resolveWork(bookPath, userSpace);
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('作品文件必须是安全相对路径');
  const target = path.resolve(resolved.bookPath, relative);
  if (!inside(resolved.bookPath, target) || target === resolved.bookPath) throw new Error('作品文件越界');
  atomicWrite(target, Buffer.from(String(content)), { allowReplace });
  return target;
}

export function writeWorkBatch(bookPath, entries, { userSpace = {} } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('批量写入 entries 不能为空');
  return withBookWriteLock(bookPath, (resolved) => {
    const prepared = [];
    const targets = new Set();
    for (const entry of entries) {
      const relative = entry?.relative;
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('批量作品文件必须是安全相对路径');
      const target = path.resolve(resolved.bookPath, relative);
      if (!inside(resolved.bookPath, target) || target === resolved.bookPath || targets.has(target)) throw new Error(`批量作品文件越界或重复：${relative}`);
      targets.add(target);
      ensureDirectory(path.dirname(target));
      const stat = fs.lstatSync(target, { throwIfNoEntry: false });
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) throw new Error(`拒绝批量写入不安全文件：${target}`);
      const original = stat ? fs.readFileSync(target) : null;
      const bytes = Buffer.isBuffer(entry.content) ? Buffer.from(entry.content) : Buffer.from(String(entry.content));
      if (entry.expected_exists === true && original === null) throw new Error(`作品文件 preimage 已漂移（预期存在）：${target}`);
      if (entry.expected_exists === false && original !== null) throw new Error(`作品文件 preimage 已漂移（预期不存在）：${target}`);
      if (entry.expected_sha256 != null) {
        if (!/^[a-f0-9]{64}$/u.test(entry.expected_sha256) || original === null || sha256(original) !== entry.expected_sha256) {
          throw new Error(`作品文件 preimage 哈希已漂移：${target}`);
        }
      }
      if (original && entry.allowReplace !== true && Buffer.compare(original, bytes) !== 0) throw new Error(`拒绝覆盖已有用户内容：${target}`);
      prepared.push({ target, bytes, original });
    }
    const staged = prepared.map((item) => ({ ...item, temporary: path.join(path.dirname(item.target), `.${path.basename(item.target)}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.batch.tmp`) }));
    const committed = [];
    try {
      for (const item of staged) fs.writeFileSync(item.temporary, item.bytes, { flag: 'wx' });
      for (const item of staged) { fs.renameSync(item.temporary, item.target); committed.push(item); }
      return { written: true, files: staged.map((item) => item.target) };
    } catch (error) {
      for (const item of staged) if (fs.existsSync(item.temporary)) fs.rmSync(item.temporary, { force: true });
      const rollbackFailures = [];
      for (const item of committed.reverse()) {
        try {
          const current = fs.readFileSync(item.target);
          if (Buffer.compare(current, item.bytes) !== 0) throw new Error('目标已被外部改写，拒绝回滚覆盖');
          if (item.original === null) fs.rmSync(item.target, { force: true });
          else {
            const rollback = `${item.temporary}.rollback`;
            fs.writeFileSync(rollback, item.original, { flag: 'wx' });
            fs.renameSync(rollback, item.target);
          }
        } catch (rollbackError) {
          rollbackFailures.push(`${item.target}: ${rollbackError.message}`);
        }
      }
      if (rollbackFailures.length) throw new Error(`${error.message}；批量写入回滚不完整：${rollbackFailures.join('；')}`);
      throw error;
    }
  }, { userSpace });
}
