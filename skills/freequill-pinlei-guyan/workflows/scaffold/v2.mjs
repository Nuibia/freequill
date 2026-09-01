import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { loadArtifact } from '../../runtime/lib/storage.mjs';
import { createWork } from '../../runtime/workspace.mjs';

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
          if (resolved.topic?.approval && resolved.topic.approval.approved !== true) return { status: 'blocked', reason: '选题尚未批准签出' };
          return { passed: true, title: title.trim(), form: input.form ?? 'short', topic_package: resolved.topic, selection_artifact_ref: resolved.artifact_ref };
        } catch (error) {
          return { status: 'blocked', reason: '脚手架输入无效', details: { message: error.message } };
        }
      },
    },
    {
      id: 'create-work', kind: 'deterministic', outputArtifactType: 'work-space', allowedSideEffects: ['workspace_write'],
      input: ({ results }) => resultOutput(results, 'input-gate'),
      run: ({ input }) => {
        try { return { created: true, ...createWork({ title: input.title, form: input.form, topicPackage: input.topic_package }) }; }
        catch (error) { return { status: 'blocked', reason: '创建用户作品空间失败', details: { message: error.message } }; }
      },
    },
  ],
  complete: ({ results }) => ({ ...resultOutput(results, 'create-work'), selection_artifact_ref: resultOutput(results, 'input-gate').selection_artifact_ref }),
});
