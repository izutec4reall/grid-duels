import { createFileRoute } from "@tanstack/react-router";
import { AppError } from "@/server/core";
import { api } from "@/server/http";
import {
  joinTournament,
  leaveTournament,
  startTournament,
  stopTournament,
} from "@/server/tournaments";

const ACTIONS = {
  join: joinTournament,
  leave: leaveTournament,
  start: startTournament,
  stop: stopTournament,
};

export const Route = createFileRoute("/api/tournaments/$id/$action")({
  server: {
    handlers: {
      POST: ({ request, params: { id, action } }) =>
        api(request, (actor, origin) => {
          const run = Object.hasOwn(ACTIONS, action)
            ? ACTIONS[action as keyof typeof ACTIONS]
            : undefined;
          if (!run) throw new AppError(404, "Not found");
          return run(actor, id, origin);
        }),
    },
  },
});
