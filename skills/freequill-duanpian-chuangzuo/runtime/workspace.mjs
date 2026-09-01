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

export function createWork({ title, form = 'short', topicPackage = null, options = {} }) {
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
    created_at: new Date().toISOString(),
    topic_package: topicPackage,
  };
  const marker = path.join(bookPath, '.freequill-work.json');
  if (!fs.existsSync(marker)) atomicWrite(marker, Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`));
  const readme = path.join(bookPath, 'README.md');
  if (!fs.existsSync(readme)) atomicWrite(readme, Buffer.from(`# ${normalizedTitle}\n\n由 FreeQuill 管理的${form === 'short' ? '短篇' : '长篇'}创作空间。\n`));
  const progress = path.join(bookPath, '连载进度.md');
  if (!fs.existsSync(progress)) atomicWrite(progress, Buffer.from(`# 创作进度\n\n- 状态：已创建\n`));
  return { book_path: bookPath, title: normalizedTitle, form };
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
