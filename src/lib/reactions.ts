/** The reactions players can send during a match. */
export const REACTIONS = [
  "thumbs-up",
  "heart",
  "laugh",
  "party",
  "fire",
  "handshake",
  "sad",
] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_LABELS: Record<Reaction, string> = {
  "thumbs-up": "Thumbs up",
  heart: "Heart",
  laugh: "Laugh",
  party: "Party",
  fire: "Fire",
  handshake: "Good game",
  sad: "Sad",
};
