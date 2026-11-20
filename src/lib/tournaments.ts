export const MODE_LABELS = {
  leaderboard: "Leaderboard",
  "single-elimination": "Single elimination",
  "round-robin": "Round robin",
} as const;

export type ModeKey = keyof typeof MODE_LABELS;

export const STATUS_LABELS = {
  open: "Open",
  running: "In progress",
  finished: "Finished",
} as const;
