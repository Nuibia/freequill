import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';

function title(results) { return resultOutput(results, 'selection').title.selection.candidate.title; }

export const workflow = defineSequentialWorkflow({
  id: 'fast-short', version: 2, title: 'FreeQuill Fast 短故事完整链', outputArtifactType: 'fast-short-delivery',
  steps: [
    { id: 'selection', kind: 'subworkflow', workflow: 'selection@2', input: ({ input }) => ({ ...input.selection, mode: 'fast' }) },
    { id: 'scaffold', kind: 'subworkflow', workflow: 'scaffold@2', input: ({ input, results }) => ({ selection_artifact_ref: results.selection.artifact_ref, title: input.title ?? title(results), form: 'short' }) },
    { id: 'genre', kind: 'subworkflow', workflow: 'genre-diagnose@2', input: ({ input, results }) => ({ genre: input.genre ?? 'dushi-naodong', premise: resultOutput(results, 'selection').premise.selection.candidate, title: title(results) }) },
    {
      id: 'create', kind: 'subworkflow', workflow: 'short-create@2',
      input: ({ input, results }) => ({ mode: 'fast', book_path: resultOutput(results, 'scaffold').book_path, topic_package: resultOutput(results, 'selection'), genre_diagnosis: resultOutput(results, 'genre'), brief: input.brief ?? null }),
    },
    {
      id: 'submission', kind: 'subworkflow', workflow: 'submission@2',
      input: ({ input, results }) => ({ book_path: resultOutput(results, 'scaffold').book_path, platform: input.platform ?? 'undecided', topic_package: resultOutput(results, 'selection'), delivery: resultOutput(results, 'create') }),
    },
  ],
  complete: ({ input, results }) => ({ request: input, book_path: resultOutput(results, 'scaffold').book_path, topic_package: resultOutput(results, 'selection'), genre_diagnosis: resultOutput(results, 'genre'), story: resultOutput(results, 'create'), submission: resultOutput(results, 'submission'), local_only: true }),
});
