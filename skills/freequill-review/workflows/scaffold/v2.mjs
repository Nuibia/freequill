import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { loadArtifact } from '../../runtime/lib/storage.mjs';
import { createWork, materializeBookContext } from '../../runtime/workspace.mjs';

const GENRES = new Set(['dushi-naodong', 'xuanhuan', 'guyan', 'xianyan']);

function resolveTopic(input, root, stateDir) {
  if (typeof input.selection_artifact_ref === 'string') {
    const loaded = loadArtifact(root, input.selection_artifact_ref, stateDir);
    if (loaded.artifact.artifact_type !== 'topic-package') throw new Error('选题 Artifact 类型不是 topic-package');
    return { topic: loaded.payload, artifact_ref: loaded.ref };
  }
  if (input.topic_package && typeof input.topic_package === 'object') return { topic: input.topic_package, artifact_ref: null };
  return null;
}

function selectedTitle(topic) {
  return topic?.title?.selection?.candidate?.title ?? topic?.title ?? null;
}

export const workflow = defineSequentialWorkflow({
  id: 'scaffold', version: 2, title: 'FreeQuill 作品脚手架', outputArtifactType: 'scaffold-package',
  steps: [
    {
      id: 'input-gate', kind: 'deterministic', outputArtifactType: 'scaffold-input', input: ({ input }) => input,
      run: ({ input, root, stateDir }) => {
        try {
          const resolved = resolveTopic(input, root, stateDir);
          if (!resolved) return { status: 'needs_input', required: ['selection_artifact_ref 或 topic_package'], reason: '脚手架需要已确认选题' };
          const title = input.title ?? selectedTitle(resolved.topic);
          if (typeof title !== 'string' || !title.trim()) return { status: 'needs_input', required: ['title'], reason: '选题中没有可用标题' };
          const genre = input.genre ?? resolved.topic?.request?.genre;
          if (!GENRES.has(genre)) return { status: 'needs_input', required: ['genre'], reason: '脚手架需要受支持的 genre' };
          if (resolved.topic?.approval && resolved.topic.approval.approved !== true) return { status: 'blocked', reason: '选题尚未批准签出' };
          return { passed: true, title: title.trim(), form: input.form ?? 'short', genre, topic_package: resolved.topic, selection_artifact_ref: resolved.artifact_ref };
        } catch (error) {
          return { status: 'blocked', reason: '脚手架输入无效', details: { message: error.message } };
        }
      },
    },
    {
      id: 'create-work', kind: 'deterministic', outputArtifactType: 'work-space', allowedSideEffects: ['workspace_write'],
      input: ({ results }) => resultOutput(results, 'input-gate'),
      run: ({ input }) => {
        try { return { created: true, ...createWork({ title: input.title, form: input.form, genre: input.genre, topicPackage: input.topic_package }) }; }
        catch (error) { return { status: 'blocked', reason: '创建用户作品空间失败', details: { message: error.message } }; }
      },
    },
    {
      id: 'configure-book-context', kind: 'capability', capability: 'configure-book-context@2', outputArtifactType: 'book-context-candidate',
      policyRefs: ['policies/creation/short.v2.json'],
      input: ({ results }) => ({ book_path: resultOutput(results, 'create-work').book_path, genre: resultOutput(results, 'input-gate').genre, topic_package: resultOutput(results, 'input-gate').topic_package }),
    },
    {
      id: 'materialize-book-context', kind: 'deterministic', outputArtifactType: 'book-context-materialization', allowedSideEffects: ['workspace_write'],
      input: ({ results }) => ({ book_path: resultOutput(results, 'create-work').book_path, genre: resultOutput(results, 'input-gate').genre, context: resultOutput(results, 'configure-book-context') }),
      run: ({ input, root, state }) => {
        try {
          const action = Object.values(state.completed_actions).find((item) => item.node_id === 'configure-book-context');
          return materializeBookContext({ root, bookPath: input.book_path, genre: input.genre, context: input.context, sourceBundleSha256: action?.execution?.context_bundle_sha256 ?? null });
        } catch (error) { return { status: 'blocked', reason: '书级 Context 落盘失败', details: { message: error.message } }; }
      },
    },
  ],
  complete: ({ results }) => ({ ...resultOutput(results, 'create-work'), genre: resultOutput(results, 'input-gate').genre, l3: resultOutput(results, 'materialize-book-context'), selection_artifact_ref: resultOutput(results, 'input-gate').selection_artifact_ref }),
});
