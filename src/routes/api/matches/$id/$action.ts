import { createFileRoute } from "@tanstack/react-router";
import { AppError } from "@/server/core";
import { api, jsonBody } from "@/server/http";
import {
  joinMatch,
  messageInput,
  moveInput,
  offerRematch,
  playMove,
  resign,
  sendMessage,
} from "@/server/matches";

export const Route = createFileRoute("/api/matches/$id/$action")({
  server: {
    handlers: {
      POST: ({ request, params: { id, action } }) =>
        api(
          request,
          async (actor, origin) => {
            switch (action) {
              case "join":
                return joinMatch(actor, id, origin);
              case "moves":
                return playMove(
                  actor,
                  id,
                  moveInput.parse(await jsonBody(request)).cell,
                  origin,
                );
              case "resign":
                return resign(actor, id, origin);
              case "rematch":
                return offerRematch(actor, id, origin);
              case "messages":
                return sendMessage(
                  actor,
                  id,
                  messageInput.parse(await jsonBody(request)),
                );
              default:
                throw new AppError(404, "Not found");
            }
          },
          action === "messages" ? 201 : 200,
        ),
    },
  },
});
