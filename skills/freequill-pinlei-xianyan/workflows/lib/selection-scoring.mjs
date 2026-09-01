import { object } from '../../runtime/lib/storage.mjs';

export const SCORECARDS = Object.freeze({
  theme: Object.freeze({ relevance: 25, specificity: 20, dilemma_cost: 20, ending_payoff: 20, non_preachy: 15 }),
  premise: Object.freeze({ clarity: 15, desire_stakes: 20, character_mechanism: 15, differentiation: 20, emotional_payoff: 15, engine_durability: 15 }),
  title: Object.freeze({ genre_clarity: 20, conflict_payoff: 25, emotion: 20, curiosity: 15, naturalness: 10, consistency: 10 }),
});
const HARD_GATES = Object.freeze({
  theme: Object.freeze(['evidence_valid', 'craft_supported', 'not_generic_moral']),
  premise: Object.freeze(['theme_consistent', 'protagonist_can_act', 'ending_can_pay_off']),
  title: Object.freeze(['premise_consistent', 'no_false_promise', 'platform_safe']),
});

function finiteScore(value) { return typeof value === 'number' && Number.isFinite(value); }

export function qualifyEvaluations({ kind, candidates, evaluations, threshold = 75 }) {
  const scorecard = SCORECARDS[kind];
  if (!scorecard) throw new Error(`未知评分卡：${kind}`);
  if (!Array.isArray(candidates) || candidates.length < 1) return { status: 'blocked', reason: `${kind} 没有候选` };
  if (!Array.isArray(evaluations)) return { status: 'blocked', reason: `${kind} 缺少 evaluations` };
  const ids = new Set(candidates.map((item) => item.id));
  if (ids.size !== candidates.length || [...ids].some((id) => typeof id !== 'string' || !id)) {
    return { status: 'blocked', reason: `${kind} 候选 id 缺失或重复` };
  }
  const ranked = [];
  for (const candidate of candidates) {
    const evaluation = evaluations.find((item) => item.candidate_id === candidate.id);
    if (!object(evaluation) || !object(evaluation.scores)) {
      ranked.push({ candidate_id: candidate.id, total: 0, eligible: false, failures: ['missing_evaluation'] });
      continue;
    }
    const failures = [];
    let total = 0;
    for (const [criterion, maximum] of Object.entries(scorecard)) {
      const value = evaluation.scores[criterion];
      if (!finiteScore(value) || value < 0 || value > maximum) failures.push(`invalid_score:${criterion}`);
      else total += value;
    }
    if (!object(evaluation.hard_gates)) failures.push('missing_hard_gates');
    else for (const gate of HARD_GATES[kind]) if (evaluation.hard_gates[gate] !== true) failures.push(`hard_gate:${gate}`);
    ranked.push({
      candidate_id: candidate.id,
      total,
      eligible: total >= threshold && failures.length === 0,
      failures,
      rationale: evaluation.rationale ?? null,
    });
  }
  ranked.sort((a, b) => b.total - a.total || a.candidate_id.localeCompare(b.candidate_id));
  const eligible = ranked.filter((item) => item.eligible);
  if (!eligible.length) return { status: 'blocked', reason: `${kind} 无候选达到 ${threshold} 分且通过全部硬闸`, ranked };
  return { status: 'qualified', threshold, ranked, recommended_candidate_id: eligible[0].candidate_id };
}

export function chooseCandidate({ candidates, qualification, decision = null }) {
  const chosenId = decision?.selected_candidate_id ?? qualification.recommended_candidate_id;
  const score = qualification.ranked.find((item) => item.candidate_id === chosenId);
  const candidate = candidates.find((item) => item.id === chosenId);
  if (!candidate || !score?.eligible) return { status: 'blocked', reason: `所选候选 ${chosenId} 不存在或未过硬闸` };
  return { selected_candidate_id: chosenId, candidate, score, human_override: decision?.human_override === true };
}

export function selectionOverall({ theme, premise, title, fit }) {
  const themeScore = theme?.score?.total;
  const premiseScore = premise?.score?.total;
  const titleScore = title?.score?.total;
  const fitScore = fit?.score;
  if (![themeScore, premiseScore, titleScore, fitScore].every((value) => finiteScore(value) && value >= 0 && value <= 100)) {
    return { status: 'blocked', reason: '综合评分缺少有效分值' };
  }
  const requiredFitGates = ['platform_fit', 'execution_ready'];
  const failedGates = requiredFitGates.filter((gate) => fit?.hard_gates?.[gate] !== true);
  const score = Number((premiseScore * 0.45 + themeScore * 0.20 + titleScore * 0.20 + fitScore * 0.15).toFixed(2));
  return {
    status: score >= 78 && failedGates.length === 0 ? 'qualified' : 'blocked',
    threshold: 78,
    score,
    weights: { premise: 0.45, theme: 0.20, title: 0.20, platform_execution_fit: 0.15 },
    failed_gates: failedGates,
    reason: score < 78 ? '综合分低于 78' : failedGates.length ? '平台或执行硬闸未通过' : null,
  };
}
