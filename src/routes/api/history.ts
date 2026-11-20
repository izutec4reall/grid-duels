import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { listHistory } from "@/server/matches";

export const Route = createFileRoute("/api/history")({
  server: {
    handlers: {
      GET: ({ request }) =>
        api(request, async (actor) => ({ matches: await listHistory(actor) })),
    },
  },
});
