import { createFileRoute } from "@tanstack/react-router";
import { api, jsonBody } from "@/server/http";
import { createMatch, createMatchInput } from "@/server/matches";

export const Route = createFileRoute("/api/matches/")({
  server: {
    handlers: {
      POST: ({ request }) =>
        api(
          request,
          async (actor, origin) =>
            createMatch(
              actor,
              createMatchInput.parse(await jsonBody(request)),
              origin,
            ),
          201,
        ),
    },
  },
});
