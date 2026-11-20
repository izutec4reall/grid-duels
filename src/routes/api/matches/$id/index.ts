import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { cancelMatch, getMatch } from "@/server/matches";

export const Route = createFileRoute("/api/matches/$id/")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        api(request, (actor, origin) => getMatch(actor, params.id, origin)),
      DELETE: ({ request, params }) =>
        api(request, (actor) => cancelMatch(actor, params.id)),
    },
  },
});
