import fs from 'node:fs';
import path from 'node:path';
import { runHostLoop } from './lib/host-loop.mjs';
import { loadArtifact } from './lib/storage.mjs';

const FORMAT = 'freequill-writer-view-v1';

const STAGE_PATTERNS = [
  { pattern: /topic|premise|title|selection/u, message: '正在构思故事。' },
  { pattern: /scaffold|configure-book/u, message: '正在准备作品空间。' },
  { pattern: /genre|story-engine|outline|plan/u, message: '正在梳理人物、冲突和故事走向。' },
  { pattern: /draft|revise|revision/u, message: '正在写作和润色正文。' },
  { pattern: /review|evaluate|adjudicate/u, message: '正在做最后检查。' },
  { pattern: /submission|materialize|material/u, message: '正在整理成品。' },
];

const INPUT_QUESTIONS = [
  { fields: ['genre'], question: '你希望这篇故事偏都市脑洞、玄幻、古言还是现言？' },
  { fields: ['book_path'], question: '你想继续哪一本作品？请告诉我书名或作品文件夹。' },
  { fields: ['previous_chapter'], question: '请告诉我从哪一章继续，或把上一章的位置发给我。' },
  { fields: ['approved'], question: '这份故事方案是否按当前方向继续写？' },
];

function view(state, message, extra = {}) {
  return { format: FORMAT, state, message, ...extra };
}

function progressMessage(result) {
  const action = result?.pending_action;
  const identity = [action?.capability, action?.workflow, action?.node_id].filter(Boolean).join(' ');
  return STAGE_PATTERNS.find((item) => item.pattern.test(identity))?.message ?? '正在处理你的作品。';
}

function inputQuestion(result) {
  const required = Array.isArray(result?.needs_input?.required) ? result.needs_input.required : [];
  return INPUT_QUESTIONS.find((item) => item.fields.some((field) => required.includes(field)))?.question
    ?? '我还缺一项继续创作所需的信息。请补充你最在意的题材、人物或结局要求。';
}

function blockedMessage(result) {
  const reason = String(result?.blocked?.reason ?? '');
  if (/用户尚未批准|批准细纲/u.test(reason)) return '需要你确认当前故事方案后才能继续。';
  if (/三轮|仍未通过|故事引擎或细纲/u.test(reason)) return '这版还没有达到可交付标准。我已保留现有内容，你可以让我调整方向后继续。';
  if (/隔离|执行者|agent/iu.test(reason)) return '当前环境暂时无法完成独立复核，作品尚未按完成稿交付。请换到支持独立复核的环境后重试。';
  if (/冲突|核心情绪|不得覆盖|不得重定义/u.test(reason)) return '这本作品的已有设定互相冲突，需要先确认品类或书级设定。';
  if (/落盘|写入|目录|路径/u.test(reason)) return '作品暂时无法保存到目标位置。请检查该位置是否可写，然后让我重试。';
  return '当前暂时不能继续，但已有内容已经保留。你可以让我重试，或主动查看具体原因。';
}

function artifactPayload(result, { root, stateDir }) {
  if (!result?.root_artifact_ref) return null;
  try {
    return loadArtifact(root, result.root_artifact_ref, stateDir).payload;
  } catch {
    return null;
  }
}

function titleOf(payload, bookPath) {
  return payload?.topic_package?.title?.selection?.candidate?.title
    ?? payload?.request?.title
    ?? (bookPath ? path.basename(bookPath) : null)
    ?? '新作品';
}

function chaptersOf(payload) {
  const chapters = payload?.story?.draft?.chapters ?? payload?.draft?.chapters;
  if (Array.isArray(chapters) && chapters.length) {
    return chapters
      .map((chapter, index) => ({
        number: chapter?.number ?? chapter?.chapter ?? index + 1,
        title: chapter?.title,
        content: chapter?.content ?? chapter?.body,
      }))
      .filter((chapter) => typeof chapter.content === 'string' && chapter.content.trim())
      .map((chapter, index) => ({
        number: chapter.number ?? index + 1,
        title: typeof chapter.title === 'string' && chapter.title.trim() ? chapter.title.trim() : null,
        content: chapter.content.trim(),
      }));
  }
  if (typeof payload?.chapter?.content === 'string' && payload.chapter.content.trim()) {
    return [{ number: payload.chapter_number ?? 1, title: payload.chapter.title ?? null, content: payload.chapter.content.trim() }];
  }
  return [];
}

function submissionPath(payload, bookPath) {
  const files = payload?.submission?.materialization?.files;
  const material = Array.isArray(files) ? files.find((file) => typeof file === 'string' && file.endsWith('投稿物料.md')) : null;
  if (material) return material;
  if (!bookPath) return null;
  const expected = path.join(bookPath, '投稿物料.md');
  return fs.lstatSync(expected, { throwIfNoEntry: false })?.isFile() ? expected : null;
}

function completedView(result, options) {
  const payload = artifactPayload(result, options);
  const bookPath = payload?.book_path ?? payload?.story?.book_path ?? payload?.request?.book_path ?? null;
  const chapters = chaptersOf(payload);
  const title = titleOf(payload, bookPath);
  if (!bookPath || chapters.length === 0) {
    return view('problem', '作品已经处理完成，但没有找到可交付的正文。我保留了现有内容，你可以让我恢复这次创作。');
  }
  return view('done', `《${title}》已经写好。`, {
    delivery: {
      title,
      story: { chapters, body_path: path.join(bookPath, '正文') },
      saved_at: bookPath,
      submission_materials: submissionPath(payload, bookPath),
      next_options: ['继续修改这篇作品', '调整篇幅或风格', '查看或完善投稿物料'],
    },
  });
}

export function presentRuntimeState(result, { root = process.cwd(), stateDir = null, diagnosticsRequested = false } = {}) {
  let projected;
  if (result?.status === 'completed') projected = completedView(result, { root, stateDir });
  else if (result?.status === 'needs_input') {
    const question = inputQuestion(result);
    projected = view('question', question, { question });
  } else if (result?.status === 'blocked') projected = view('cannot_continue', blockedMessage(result));
  else if (result?.status === 'failed') projected = view('problem', '这次创作没有顺利完成，已有内容已经保留。你可以让我重试。');
  else projected = view('working', progressMessage(result));
  return diagnosticsRequested ? { ...projected, developer_diagnostics: result } : projected;
}

export function presentRuntimeFailure(error, { diagnosticsRequested = false } = {}) {
  const projected = view('problem', '这次创作没有顺利完成，已有内容已经保留。你可以让我重试。');
  return diagnosticsRequested ? { ...projected, developer_diagnostics: { message: error?.message ?? String(error) } } : projected;
}

function withWriterJourneyDefaults(options) {
  if (options?.start?.workflow !== 'fast-short@2') return options;
  const start = { ...options.start };
  if (!start.accessGrant) start.accessGrant = { allowed_side_effects: ['workspace_write'] };
  return { ...options, start };
}

export async function runUserJourney({ diagnosticsRequested = false, ...options } = {}) {
  try {
    const prepared = withWriterJourneyDefaults(options);
    const result = await runHostLoop(prepared);
    return presentRuntimeState(result, { root: prepared.root, stateDir: prepared.stateDir, diagnosticsRequested });
  } catch (error) {
    return presentRuntimeFailure(error, { diagnosticsRequested });
  }
}
