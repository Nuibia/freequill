import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function nested(input, key) {
  if (!object(input)) return null;
  if (typeof input[key] === 'string' && input[key].trim()) return input[key].trim();
  for (const child of ['request', 'topic_package', 'genre_diagnosis']) {
    const found = nested(input[child], key);
    if (found) return found;
  }
  return null;
}
function safeProductRef(root, value, genre) {
  const expanded = String(value).replaceAll('{genre}', genre ?? '');
  if (!expanded || path.isAbsolute(expanded) || expanded.includes('\0')) throw new Error(`Context ref 非法：${expanded}`);
  const target = path.resolve(root, expanded);
  const relative = path.relative(path.resolve(root), target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Context ref 越界：${expanded}`);
  return { ref: expanded.split(path.sep).join('/'), target };
}
function loadJsonFile(target, label) {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`${label} 缺失或不安全`);
  const bytes = fs.readFileSync(target);
  try { return { payload: JSON.parse(bytes), sha256: sha256(bytes) }; }
  catch (error) { throw new Error(`${label} JSON 非法：${error.message}`); }
}
function loadProduct(root, ref, genre) {
  const resolved = safeProductRef(root, ref, genre);
  return { ref: resolved.ref, ...loadJsonFile(resolved.target, resolved.ref) };
}
function loadBookFile(bookPath, relative) {
  const target = path.resolve(bookPath, relative);
  const inside = path.relative(path.resolve(bookPath), target);
  if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error(`L3 ref 越界：${relative}`);
  return { ref: relative.split(path.sep).join('/'), ...loadJsonFile(target, `L3 ${relative}`) };
}
function expandBookRef(relative, input) {
  let expanded = String(relative);
  if (expanded.includes('{previous_chapter}')) {
    const previous = nested(input, 'previous_chapter');
    if (!/^\d{4}$/u.test(previous ?? '')) throw new Error('L3 previous_chapter 必须是四位章号');
    expanded = expanded.replaceAll('{previous_chapter}', previous);
  }
  if (expanded.includes('{')) throw new Error(`L3 ref 含未解析变量：${expanded}`);
  return expanded;
}
function conflict(l2, l3) {
  const policy = l3.find((item) => item.ref === '设定/book-policy.json')?.payload;
  const canon = l3.find((item) => item.ref === '设定/正史账.json')?.payload;
  const state = l3.find((item) => item.ref === '设定/state/current_state.json')?.payload;
  const previousSnapshot = l3.find((item) => /^设定\/state\/chapter-snapshots\/\d{4}\.json$/u.test(item.ref))?.payload;
  if (!object(policy)) return 'book-policy 缺失';
  if (policy.status !== 'configured') return 'book-policy 尚未配置';
  if (policy.inherits?.l2_genre !== l2.genre) return 'L3 声明的品类与 L2 不一致';
  if (policy.core_emotion !== l2.core_emotion) return 'L3 重定义了 L2 核心情绪';
  if (!Array.isArray(policy.red_lines_additions)) return 'L3 书级红线必须只以 additions 追加';
  if (Object.hasOwn(policy, 'red_lines_removed') || Object.hasOwn(policy, 'l2_red_lines')) return 'L3 不得删除或覆盖 L2 红线';
  if (object(canon) && object(state) && state.canon_revision !== canon.revision) return 'current_state 未绑定当前正史 revision';
  if (object(state) && object(previousSnapshot) && previousSnapshot.after_state_revision !== state.revision) return '上一章节快照未绑定当前 state revision';
  return null;
}

export function composeActionContext({ root, capabilityContract, input, policyRefs = [] }) {
  const contract = capabilityContract?.context_contract;
  if (!object(contract)) return { status: 'blocked', reason: 'Capability 缺少 Context contract', details: { capability: capabilityContract?.id ?? null } };
  if (contract.status === 'r3.3-pending') {
    const legacy = { bundle_schema_version: 1, capability: capabilityContract.id, status: 'legacy-context-pending', policy_refs: policyRefs, layers: { l1: [], l2: [], l3: [] }, operators: [], templates: [], evals: [] };
    return { ...legacy, integrity: { canonical_sha256: sha256(canonical(legacy)) } };
  }
  const genre = nested(input, 'genre');
  const l2Mode = contract.layers?.l2?.mode;
  if (l2Mode === 'required-by-genre' && !genre) return { status: 'needs_input', required: ['genre'], reason: 'Context Composer 缺少品类' };
  const bookPath = nested(input, 'book_path');
  const l3Mode = contract.layers?.l3?.mode;
  if (['bootstrap', 'required'].includes(l3Mode) && !bookPath) return { status: 'needs_input', required: ['book_path'], reason: 'Context Composer 缺少作品路径' };
  if (l3Mode === 'required') {
    let expandedFiles;
    try { expandedFiles = contract.layers.l3.files.map((relative) => expandBookRef(relative, input)); }
    catch (error) { return { status: 'needs_input', required: ['previous_chapter'], reason: error.message }; }
    const missing = expandedFiles.filter((relative) => {
      const stat = fs.lstatSync(path.resolve(bookPath, relative), { throwIfNoEntry: false });
      return !stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1;
    });
    if (missing.length) return { status: 'needs_input', required: missing, reason: 'Context Composer 缺少书级上下文' };
  }
  try {
    const l1 = (contract.layers?.l1 ?? []).map((ref) => loadProduct(root, ref, genre));
    const l2 = [];
    if (genre && ['required-by-genre', 'optional-by-genre'].includes(l2Mode)) {
      const item = loadProduct(root, contract.layers.l2.pattern, genre);
      l2.push(item);
    }
    const operators = (contract.operators ?? []).map((ref) => loadProduct(root, ref, genre));
    const templates = (contract.templates ?? []).map((ref) => loadProduct(root, ref, genre));
    const evals = (contract.evals ?? []).map((ref) => loadProduct(root, ref, genre));
    const l3 = l3Mode === 'required' ? contract.layers.l3.files.map((ref) => loadBookFile(bookPath, expandBookRef(ref, input))) : [];
    if (l3Mode === 'required') {
      const issue = conflict(l2[0]?.payload ?? {}, l3);
      if (issue) return { status: 'blocked', reason: '三层 Context 冲突', details: { conflict: issue, capability: capabilityContract.id } };
    }
    const bundle = {
      bundle_schema_version: 1,
      capability: capabilityContract.id,
      context_profile: capabilityContract.context_profile,
      status: l3Mode === 'bootstrap' ? 'bootstrap' : 'ready',
      genre,
      book_path_scope: bookPath,
      policy_refs: policyRefs,
      layers: { l1, l2, l3 },
      operators,
      templates,
      evals,
      conflict_policy: { order: ["frozen-canon-and-state", "L1", "L2", "L3"], l3_may_tighten_only: true },
    };
    return { ...bundle, integrity: { canonical_sha256: sha256(canonical(bundle)) } };
  } catch (error) {
    return { status: 'blocked', reason: 'Context Composer 产品配置错误', details: { message: error.message, capability: capabilityContract.id } };
  }
}
