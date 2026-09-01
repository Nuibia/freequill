import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { loadArtifact } from '../../runtime/lib/storage.mjs';
import { chooseCandidate, qualifyEvaluations } from '../lib/selection-scoring.mjs';

function validateInput(input, root, stateDir) {
  if (typeof input.premise_artifact_ref !== 'string') {
    return { status: 'needs_input', required: ['premise_artifact_ref'], reason: '标题选择缺少上游 Premise Artifact' };
  }
  if (input.title_candidates != null && (!Array.isArray(input.title_candidates) || input.title_candidates.length === 0)) {
    return { status: 'needs_input', required: ['title_candidates'], reason: '只评标题时必须提供非空 title_candidates' };
  }
  try {
    const loaded = loadArtifact(root, input.premise_artifact_ref, stateDir);
    if (loaded.artifact.artifact_type !== 'premise-package') return { status: 'blocked', reason: '上游 Artifact 类型不是 premise-package' };
    if (!loaded.payload?.selection?.candidate) return { status: 'blocked', reason: '上游 Premise Artifact 尚未签出候选' };
    return {
      passed: true,
      premise_artifact_ref: loaded.ref,
      premise_package: loaded.payload,
      provided_candidates: input.title_candidates ?? null,
    };
  } catch (error) {
    return { status: 'blocked', reason: '上游 Premise Artifact 无效', details: { message: error.message } };
  }
}

function candidates(input, results) {
  return input.title_candidates ?? resultOutput(results, 'generate').candidates;
}

export const workflow = defineSequentialWorkflow({
  id: 'title-selection', version: 2, title: '标题生成与选择', outputArtifactType: 'title-evaluation',
  steps: [
    { id: 'input-gate', kind: 'deterministic', outputArtifactType: 'title-selection-input', input: ({ input }) => input, run: ({ input, root, stateDir }) => validateInput(input, root, stateDir) },
    { id: 'generate', kind: 'capability', capability: 'generate-titles@1', when: ({ input }) => input.title_candidates == null, outputArtifactType: 'title-candidates', policyRefs: ['policies/selection/title-scoring.v2.json'], input: ({ input, results }) => ({ request: input, premise_package: resultOutput(results, 'input-gate').premise_package }) },
    { id: 'evaluate', kind: 'capability', capability: 'evaluate-titles@1', outputArtifactType: 'title-candidate-evaluation', policyRefs: ['policies/selection/title-scoring.v2.json'], isolation: ({ mode }) => ({ required: mode === 'fast', reason: 'Fast 关键 Eval 必须隔离' }), input: ({ input, results }) => ({ request: input, premise_package: resultOutput(results, 'input-gate').premise_package, candidates: candidates(input, results) }) },
    { id: 'qualify', kind: 'deterministic', outputArtifactType: 'title-ranking', input: ({ input, results }) => ({ candidates: candidates(input, results), evaluations: resultOutput(results, 'evaluate').evaluations }), run: ({ input }) => qualifyEvaluations({ kind: 'title', ...input }) },
    { id: 'human-decision', kind: 'human_input', when: ({ mode }) => mode === 'classic', required: ['selected_candidate_id'], prompt: '请选择一个已通过硬闸的标题；否决推荐项时提交 human_override=true 与理由。', input: ({ results }) => ({ ranking: resultOutput(results, 'qualify') }) },
    { id: 'choose', kind: 'deterministic', input: ({ input, results }) => ({ candidates: candidates(input, results), qualification: resultOutput(results, 'qualify'), decision: results['human-decision']?.output ?? null }), run: ({ input }) => chooseCandidate(input) },
  ],
  complete: ({ input, results }) => ({ request: input, premise_artifact_ref: resultOutput(results, 'input-gate').premise_artifact_ref, candidates: candidates(input, results), evaluations: resultOutput(results, 'evaluate').evaluations, ranking: resultOutput(results, 'qualify'), selection: resultOutput(results, 'choose') }),
});
