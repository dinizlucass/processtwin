/** Separate document/modeling quality from the shorter interactive interview. */
export function mappingModel(): string {
  return process.env.OPENAI_MAPPING_MODEL || "gpt-5.4-mini";
}

export function mappingOptions() {
  const model = mappingModel();
  return { model, ...(/^gpt-5\.4(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model) ? { reasoning_effort: "medium" as const } : {}) };
}

export function mappingResponseOptions() {
  const { model, reasoning_effort } = mappingOptions();
  return { model, ...(reasoning_effort ? { reasoning: { effort: reasoning_effort } } : {}), store: false as const };
}

/** Chat Completions rejects function tools with Luna's default reasoning effort. */
export function mappingInterviewOptions(hasTranscript = true) {
  const model = hasTranscript ? mappingModel() : process.env.OPENAI_MODEL || "gpt-4o-mini";
  return { model, ...(model === "gpt-5.6-luna" ? { reasoning_effort: "none" as const } : {}) };
}
