import type { Tone } from "./mock-data";

export const toneText: Record<Tone, string> = {
  success: "text-success-strong",
  warning: "text-warning-text",
  danger: "text-danger-strong",
  accent: "text-accent",
};

export const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent-2",
};

export const toneBadge: Record<Tone, string> = {
  success: "text-success-strong bg-success-soft",
  warning: "text-warning-text bg-warning-soft",
  danger: "text-danger-strong bg-danger-soft",
  accent: "text-accent bg-accent-soft",
};

export const toneBar: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};
