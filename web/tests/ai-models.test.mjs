import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { mappingInterviewOptions } = loadTs("lib/ai-models.ts");

test("Luna disables reasoning for Chat Completions function tools", () => {
  const previous = process.env.OPENAI_MAPPING_MODEL;
  const previousChat = process.env.OPENAI_MODEL;
  process.env.OPENAI_MAPPING_MODEL = "gpt-5.6-luna";
  process.env.OPENAI_MODEL = "gpt-5.6-luna";
  try {
    assert.deepEqual(mappingInterviewOptions(), {
      model: "gpt-5.6-luna",
      reasoning_effort: "none",
    });
    assert.deepEqual(mappingInterviewOptions(false), {
      model: "gpt-5.6-luna",
      reasoning_effort: "none",
    });
  } finally {
    if (previous === undefined) delete process.env.OPENAI_MAPPING_MODEL;
    else process.env.OPENAI_MAPPING_MODEL = previous;
    if (previousChat === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousChat;
  }
});
