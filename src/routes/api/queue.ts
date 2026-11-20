import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { gameInput } from "@/server/core";
import { api, jsonBody } from "@/server/http";
import { getQueue, joinQueue, leaveQueue } from "@/server/queue";

const joinInput = z.object({ game: gameInput }).strict();

export const Route = createFileRoute("/api/queue")({
  server: {
    handlers: {
      GET: ({ request }) => api(request, (actor) => getQueue(actor)),
      POST: ({ request }) =>
        api(request, async (actor) =>
          joinQueue(actor, joinInput.parse(await jsonBody(request)).game),
        ),
      DELETE: ({ request }) => api(request, (actor) => leaveQueue(actor)),
    },
  },
});
