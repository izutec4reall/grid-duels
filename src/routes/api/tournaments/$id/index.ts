import { createFileRoute } from "@tanstack/react-router";
import { api, jsonBody } from "@/server/http";
import {
  deleteTournament,
  editTournament,
  editTournamentInput,
  getTournament,
} from "@/server/tournaments";

export const Route = createFileRoute("/api/tournaments/$id/")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        api(request, (actor, origin) =>
          getTournament(actor, params.id, origin),
        ),
      PATCH: ({ request, params }) =>
        api(request, async (actor, origin) =>
          editTournament(
            actor,
            params.id,
            editTournamentInput.parse(await jsonBody(request)),
            origin,
          ),
        ),
      DELETE: ({ request, params }) =>
        api(request, (actor) => deleteTournament(actor, params.id)),
    },
  },
});
