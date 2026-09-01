import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { loadArtifact } from '../../runtime/lib/storage.mjs';
import { chooseCandidate, qualifyEvaluations } from '../lib/selection-scoring.mjs';

function validateInput(input, root, stateDir) {
  if (typeof input.topic_direction_artifact_ref !== 'string') {
    return { status: 'needs_input', required: ['topic_direction_artifact_ref'], reason: 'Premise 选择缺少上游立意 Artifact' };
  }
  if (input.premise_candidates != null && (!Array.isArray(input.premise_candidates) || input.premise_candidates.length === 0)) {
    return { status: 'needs_input', required: ['premise_candidates'], reason: '只评 Premise 时必须提供非空 premise_candidates' };
  }
  try {
    const loaded = loadArtifact(root, input.topic_direction_artifact_ref, stateDir);
    if (loaded.artifact.artifact_type !== 'topic-direction-package') {
      return { status: 'blocked', reason: '上游 Artifact 类型不是 topic-direction-package' };
    }
    if (!loaded.payload?.selection?.candidate) return { status: 'blocked', reason: '上游立意 Artifact 尚未签出候选' };
    return {
      passed: true,
      topic_direction_artifact_ref: loaded.ref,
      topic_direction_package: loaded.payload,
      provided_candidates: input.premise_candidates ?? null,
    };
  } catch (error) {
    return { status: 'blocked', reason: '上游立意 Artifact 无效', details: { message: error.message } };
  }
}

function candidates(input, results) {
  return input.premise_candidates ?? resultOutput(results, 'generate').candidates;
}

export const workflow = defineSequentialWorkflow({
  id: 'premise-selection', version: 2, title: 'Premise 生成与选择', outputArtifactType: 'premise-package',
  steps: [
    { id: 'input-gate', kind: 'deterministic', outputArtifactType: 'premise-selection-input', input: ({ input }) => input, run: ({ input, root, stateDir }) => validateInput(input, root, stateDir) },
    { id: 'generate', kind: 'capability', capability: 'generate-premises@1', when: ({ input }) => input.premise_candidates == null, outputArtifactType: 'premise-candidates', policyRefs: ['policies/selection/premise-scoring.v2.json'], input: ({ input, results }) => ({ request: input, topic_direction_package: resultOutput(results, 'input-gate').topic_direction_package }) },
    { id: 'evaluate', kind: 'capability', capability: 'evaluate-premises@1', outputArtifactType: 'premise-evaluation', policyRefs: ['policies/selection/premise-scoring.v2.json'], isolation: ({ mode }) => ({ required: mode === 'fast', reason: 'Fast 关键 Eval 必须隔离' }), input: ({ input, results }) => ({ request: input, topic_direction_package: resultOutput(results, 'input-gate').topic_direction_package, candidates: candidates(input, results) }) },
    { id: 'qualify', kind: 'deterministic', outputArtifactType: 'premise-ranking', input: ({ input, results }) => ({ candidates: candidates(input, results), evaluations: resultOutput(results, 'evaluate').evaluations }), run: ({ input }) => qualifyEvaluations({ kind: 'premise', ...input }) },
    { id: 'human-decision', kind: 'human_input', when: ({ mode }) => mode === 'classic', required: ['selected_candidate_id'], prompt: '请选择一个已通过硬闸的 Premise；否决推荐项时提交 human_override=true 与理由。', input: ({ results }) => ({ ranking: resultOutput(results, 'qualify') }) },
    { id: 'choose', kind: 'deterministic', input: ({ input, results }) => ({ candidates: candidates(input, results), qualification: resultOutput(results, 'qualify'), decision: results['human-decision']?.output ?? null }), run: ({ input }) => chooseCandidate(input) },
  ],
  complete: ({ input, results }) => ({ request: input, topic_direction_artifact_ref: resultOutput(results, 'input-gate').topic_direction_artifact_ref, candidates: candidates(input, results), evaluations: resultOutput(results, 'evaluate').evaluations, ranking: resultOutput(results, 'qualify'), selection: resultOutput(results, 'choose') }),
});
