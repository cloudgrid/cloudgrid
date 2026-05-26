import { AiEvalWorkspace } from "../features/ai-eval/workspace";

export const aiEvalEnabled =
  import.meta.env.CLOUDGRID_AI_EVAL_ENABLED !== "false" &&
  import.meta.env.VITE_CLOUDGRID_AI_EVAL_ENABLED !== "false";

export function AiEvalRoute() {
  return <AiEvalWorkspace enabled={aiEvalEnabled} />;
}
