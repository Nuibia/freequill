import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { writeWorkFile, writeWorkJson } from '../../runtime/workspace.mjs';

const PLATFORMS = new Set(['generic', 'custom', 'undecided']);

export const workflow = defineSequentialWorkflow({
  id: 'submission', version: 2, title: '本地投稿物料生成', outputArtifactType: 'submission-package',
  steps: [
    {
      id: 'input-gate', kind: 'deterministic', outputArtifactType: 'submission-input', input: ({ input }) => input,
      run: ({ input }) => {
        const platform = input.platform ?? 'undecided';
        if (typeof input.book_path !== 'string') return { status: 'needs_input', required: ['book_path'], reason: '投稿物料需要作品路径' };
        if (!PLATFORMS.has(platform)) return { status: 'blocked', reason: `不支持的平台标识：${platform}` };
        return { passed: true, ...input, platform };
      },
    },
    { id: 'materials', kind: 'capability', capability: 'build-submission-materials@1', outputArtifactType: 'submission-materials', policyRefs: ['policies/platform/submission.v2.json'], input: ({ results }) => resultOutput(results, 'input-gate') },
    {
      id: 'materialize', kind: 'deterministic', outputArtifactType: 'submission-materialization', allowedSideEffects: ['workspace_write'],
      input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), materials: resultOutput(results, 'materials') }),
      run: ({ input }) => {
        try {
          if (typeof input.materials?.markdown !== 'string' || !input.materials.markdown.trim()) return { status: 'blocked', reason: '投稿 Capability 缺少 markdown' };
          const markdown = writeWorkFile(input.book_path, '投稿物料.md', `${input.materials.markdown.trim()}\n`);
          const profile = writeWorkJson(input.book_path, '设定/投稿档案.json', { platform: input.platform, profile: input.materials.profile ?? {}, generated_at: new Date().toISOString(), local_only: true });
          return { written: true, local_only: true, platform_action_performed: false, files: [markdown, profile] };
        } catch (error) { return { status: 'blocked', reason: '投稿物料落盘失败', details: { message: error.message } }; }
      },
    },
  ],
  complete: ({ results }) => ({ request: resultOutput(results, 'input-gate'), materials: resultOutput(results, 'materials'), materialization: resultOutput(results, 'materialize') }),
});
