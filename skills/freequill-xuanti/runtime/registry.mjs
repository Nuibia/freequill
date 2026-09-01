import { workflow as topicDirection } from '../workflows/topic-direction/v2.mjs';
import { workflow as premiseSelection } from '../workflows/premise-selection/v2.mjs';
import { workflow as titleSelection } from '../workflows/title-selection/v2.mjs';
import { workflow as selection } from '../workflows/selection/v2.mjs';

const WORKFLOWS = [topicDirection, premiseSelection, titleSelection, selection];
const registry = new Map(WORKFLOWS.map((item) => [`${item.id}@${item.version}`, item]));

export function normalizeWorkflowRef(value) {
  const matched = /^([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/.exec(value ?? '');
  if (!matched) throw new Error(`workflow 必须写成 <kebab-case>@<version>：${String(value)}`);
  return { id: matched[1], version: Number(matched[2]), ref: `${matched[1]}@${matched[2]}` };
}
export function getWorkflow(value) {
  const parsed = normalizeWorkflowRef(value);
  const found = registry.get(parsed.ref);
  if (!found) throw new Error(`未知 Workflow：${parsed.ref}`);
  return found;
}
export function listWorkflows() {
  return WORKFLOWS.map((item) => ({ workflow: `${item.id}@${item.version}`, title: item.title, invocation_modes: item.invocationModes, output_artifact_type: item.outputArtifactType }));
}
