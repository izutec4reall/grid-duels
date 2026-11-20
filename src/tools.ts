// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in member.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { gameInput } from "@/server/core";
import { toActor } from "@/server/http";
import { listHistory, listOpenMatches } from "@/server/matches";
import { listRankings } from "@/server/ratings";

export const tools = defineTools({
  list_my_games: {
    description:
      "List the member's games that are waiting for an opponent or being played.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => listOpenMatches(toActor(user)),
  },
  list_my_history: {
    description:
      "List the member's finished games with opponent, game and result, newest first.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => listHistory(toActor(user)),
  },
  get_rankings: {
    description:
      "The ranking of members for one game: rating, wins, losses and draws.",
    risk: "read",
    input: z.object({ game: gameInput }).strict(),
    handler: ({ game }) => listRankings(game),
  },
});
