import { createFileRoute } from "@tanstack/react-router";
import { api, jsonBody } from "@/server/http";
import {
  createTournament,
  createTournamentInput,
  listTournaments,
} from "@/server/tournaments";

export const Route = createFileRoute("/api/tournaments/")({
  server: {
    handlers: {
      GET: ({ request }) => api(request, (actor) => listTournaments(actor)),
      POST: ({ request }) =>
        api(
          request,
          async (actor, origin) =>
            createTournament(
              actor,
              createTournamentInput.parse(await jsonBody(request)),
              origin,
            ),
          201,
        ),
    },
  },
});
