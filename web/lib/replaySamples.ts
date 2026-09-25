/** Traces to start from on the Replay page: the test fixtures, one per kind of export. */

import agentRun from "./fixtures/langsmith-agent-run.json";
import structured from "./fixtures/langsmith-structured-output.json";
import runsArray from "./fixtures/langsmith-runs-array.json";
import openaiRequest from "./fixtures/openai-request.json";

export interface ReplaySample {
  id: string;
  name: string;
  description: string;
  group: string;
  value: unknown;
}

export const REPLAY_SAMPLES: ReplaySample[] = [
  {
    id: "structured",
    name: "with_structured_output",
    description: "A chain that extracts a Person with a forced tool call. The schema comes from the trace, so Constrained can replay it under a mask.",
    group: "LangSmith exports",
    value: structured,
  },
  {
    id: "agent",
    name: "Tool-calling agent",
    description: "Two LLM calls around a weather tool. Pick either call, and cut before the tool call or before the final answer.",
    group: "LangSmith exports",
    value: agentRun,
  },
  {
    id: "runs",
    name: "Flat run list",
    description: "Runs linked by parent_run_id, one with response_format and one that failed with a rate limit.",
    group: "LangSmith exports",
    value: runsArray,
  },
  {
    id: "request",
    name: "Chat request",
    description: "A plain OpenAI-style request: a developer message, a user message and a json_schema response format.",
    group: "Message lists",
    value: openaiRequest,
  },
];
