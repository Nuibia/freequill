import crypto from 'node:crypto';
import { resolveUserSpace } from '../user-space.mjs';
import fs from 'node:fs';
import path from 'node:path';

const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function inspectPlain(file, kind = 'file') {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { ok: false, reason: '不存在' };
  if (stat.isSymbolicLink()) return { ok: false, reason: '是符号链接' };
  if (kind === 'file' && (!stat.isFile() || stat.nlink !== 1)) return { ok: false, reason: '不是单链接普通文件' };
  if (kind === 'directory' && !stat.isDirectory()) return { ok: false, reason: '不是目录' };
  return { ok: true, stat };
}

function ensureDirectory(file) {
  fs.mkdirSync(file, { recursive: true });
  const inspected = inspectPlain(file, 'directory');
  if (!inspected.ok) throw new Error(`目录不安全：${file}（${inspected.reason}）`);
}

export function atomicWrite(file, bytes, { mustNotExist = false } = {}) {
  ensureDirectory(path.dirname(file));
  const existing = fs.lstatSync(file, { throwIfNoEntry: false });
  if (mustNotExist && existing) throw new Error(`目标已存在，拒绝覆盖：${file}`);
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) {
    throw new Error(`拒绝覆盖不安全文件：${file}`);
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', existing ? existing.mode & 0o777 : 0o644);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } catch (error) {
    if (descriptor != null) {
      try { fs.closeSync(descriptor); } catch { /* 原异常优先。 */ }
    }
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export function atomicWriteJson(file, value, options) {
  atomicWrite(file, jsonBytes(value), options);
}

export function readJson(file, label = 'JSON') {
  const inspected = inspectPlain(file);
  if (!inspected.ok) throw new Error(`${label} 不可安全读取：${file}（${inspected.reason}）`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} 无法解析：${error.message}`);
  }
}

export function appendJsonLine(file, value) {
  ensureDirectory(path.dirname(file));
  const existing = fs.lstatSync(file, { throwIfNoEntry: false });
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) {
    throw new Error(`拒绝追加不安全文件：${file}`);
  }
  const descriptor = fs.openSync(file, 'a', 0o644);
  try {
    fs.writeSync(descriptor, `${JSON.stringify(value)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function runtimePaths(root, runId = null, stateDir = null) {
  const absoluteRoot = path.resolve(root);
  const base = stateDir ? path.resolve(stateDir) : resolveUserSpace().stateDir;
  const runsDir = path.join(base, 'runs');
  if (runId == null) return { root: absoluteRoot, base, runsDir };
  if (!RUN_ID.test(runId)) throw new Error('run-id 必须是 kebab-case');
  const runDir = path.join(runsDir, runId);
  return {
    root: absoluteRoot,
    base,
    runsDir,
    runDir,
    manifestFile: path.join(runDir, 'manifest.json'),
    stateFile: path.join(runDir, 'state.json'),
    eventsFile: path.join(runDir, 'events.jsonl'),
    artifactsDir: path.join(runDir, 'artifacts'),
    traceDir: path.join(runDir, 'trace'),
    authorizationDir: path.join(base, 'authorizations'),
    authorizationFile: path.join(base, 'authorizations', `${runId}.json`),
    lockDir: path.join(runDir, '.lock'),
  };
}

export function createRunDirectories(paths) {
  ensureDirectory(paths.runsDir);
  fs.mkdirSync(paths.runDir);
  ensureDirectory(paths.artifactsDir);
  ensureDirectory(paths.traceDir);
}

export function withRunLock(paths, callback) {
  try {
    fs.mkdirSync(paths.lockDir);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`run 正被其他进程修改：${path.basename(paths.runDir)}`);
    throw error;
  }
  try {
    return callback();
  } finally {
    fs.rmdirSync(paths.lockDir);
  }
}

export function loadRunFiles(paths) {
  return {
    manifest: readJson(paths.manifestFile, 'Runtime manifest'),
    state: readJson(paths.stateFile, 'Runtime state'),
  };
}

export function commitState(paths, state, event) {
  const next = structuredClone(state);
  next.revision += 1;
  next.updated_at = new Date().toISOString();
  const stateHash = sha256(canonicalJson(next));
  appendJsonLine(paths.eventsFile, {
    schema_version: 1,
    event_id: event.event_id ?? crypto.randomUUID(),
    sequence: next.revision,
    occurred_at: next.updated_at,
    ...event,
    state_sha256: stateHash,
  });
  atomicWriteJson(paths.stateFile, next);
  return next;
}

export function createArtifact(paths, { type, payload, producer, metadata = {} }) {
  if (typeof type !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(type)) throw new Error('artifact type 必须是 kebab-case');
  const createdAt = new Date().toISOString();
  const unsigned = {
    schema_version: 1,
    artifact_type: type,
    created_at: createdAt,
    producer,
    metadata,
    payload,
  };
  const digest = sha256(canonicalJson(unsigned));
  const artifact = { ...unsigned, integrity: { algorithm: 'sha256', canonical_payload_sha256: digest } };
  const directory = path.join(paths.artifactsDir, type);
  ensureDirectory(directory);
  const file = path.join(directory, `${digest}.json`);
  if (!fs.existsSync(file)) atomicWriteJson(file, artifact, { mustNotExist: true });
  return {
    ref: `artifact://${path.basename(paths.runDir)}/${type}/${digest}`,
    sha256: digest,
    type,
    file,
    artifact,
  };
}

export function parseArtifactRef(ref) {
  const matched = /^artifact:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-f0-9]{64})$/.exec(ref ?? '');
  if (!matched) throw new Error(`artifact_ref 非法：${String(ref)}`);
  return { runId: matched[1], type: matched[2], sha256: matched[3] };
}

export function loadArtifact(root, ref, stateDir = null) {
  const parsed = parseArtifactRef(ref);
  const paths = runtimePaths(root, parsed.runId, stateDir);
  const file = path.join(paths.artifactsDir, parsed.type, `${parsed.sha256}.json`);
  const artifact = readJson(file, 'Artifact');
  const unsigned = structuredClone(artifact);
  delete unsigned.integrity;
  const digest = sha256(canonicalJson(unsigned));
  if (!SHA256.test(artifact?.integrity?.canonical_payload_sha256 ?? '')
    || artifact.integrity.algorithm !== 'sha256'
    || digest !== artifact.integrity.canonical_payload_sha256
    || digest !== parsed.sha256
    || artifact.artifact_type !== parsed.type) {
    throw new Error(`Artifact integrity 不一致：${ref}`);
  }
  return { ref, file, artifact, payload: artifact.payload };
}

export function listRunIds(root, stateDir = null) {
  const paths = runtimePaths(root, null, stateDir);
  const inspected = inspectPlain(paths.runsDir, 'directory');
  if (!inspected.ok) return [];
  return fs.readdirSync(paths.runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RUN_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function validateEvidenceRefs(root, refs) {
  if (refs == null) return [];
  if (!Array.isArray(refs)) throw new Error('evidence_refs 必须是数组');
  return refs.map((item, index) => {
    if (!object(item) || typeof item.ref !== 'string' || path.isAbsolute(item.ref)) throw new Error(`evidence_refs[${index}] 非法`);
    const normalized = path.posix.normalize(item.ref.replaceAll('\\', '/'));
    if (normalized.startsWith('../') || normalized.startsWith('.git/') || normalized === '.') throw new Error(`evidence_refs[${index}] 越界`);
    const file = path.resolve(root, normalized);
    const relative = path.relative(path.resolve(root), file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`evidence_refs[${index}] 越仓`);
    const inspected = inspectPlain(file);
    if (!inspected.ok) throw new Error(`evidence_refs[${index}] 不可读：${inspected.reason}`);
    const digest = sha256(fs.readFileSync(file));
    if (item.sha256 != null && item.sha256 !== digest) throw new Error(`evidence_refs[${index}] 哈希漂移`);
    return { ref: normalized, sha256: digest };
  });
}
