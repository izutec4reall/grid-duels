import { createFileRoute } from "@tanstack/react-router";
import { gameInput } from "@/server/core";
import { api } from "@/server/http";
import { listRankings } from "@/server/ratings";

export const Route = createFileRoute("/api/rankings/$game")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        api(request, async () => ({
          players: await listRankings(gameInput.parse(params.game)),
        })),
    },
  },
});
