import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { AppError, gameInput } from "@/server/core";
import { toActor } from "@/server/http";
import * as m from "@/server/matches";
import * as q from "@/server/queue";
import { listRankings } from "@/server/ratings";
import * as t from "@/server/tournaments";

// Every function runs behind ensureUserMiddleware; the server code takes the
// signed-in member and checks what they may see and change.

const origin = () => new URL(getRequest().url).origin;

/** A refusal reaches the page as its message; anything else stays generic. */
async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw new Error(error.message);
    throw error;
  }
}

const idInput = z.object({ id: z.string().min(1).max(64) }).strict();

export const getLobby = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const actor = toActor(context.user);
    const [open, queue] = await Promise.all([
      m.listOpenMatches(actor),
      q.getQueue(actor),
    ]);
    return { open, queue };
  });

export const createMatch = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => m.createMatchInput.parse(data))
  .handler(({ data, context }) =>
    run(() => m.createMatch(toActor(context.user), data, origin())),
  );

export const getMatch = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(({ data, context }) =>
    run(() => m.getMatch(toActor(context.user), data.id, origin())),
  );

const matchAction = z
  .object({
    id: z.string().min(1).max(64),
    action: z.enum(["join", "resign", "rematch", "cancel"]),
  })
  .strict();

export const matchCommand = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => matchAction.parse(data))
  .handler(({ data, context }) =>
    run(async () => {
      const actor = toActor(context.user);
      if (data.action === "join") return m.joinMatch(actor, data.id, origin());
      if (data.action === "resign") return m.resign(actor, data.id, origin());
      if (data.action === "rematch")
        return m.offerRematch(actor, data.id, origin());
      await m.cancelMatch(actor, data.id);
      return null;
    }),
  );

export const playMove = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    idInput.extend({ cell: z.number().int() }).parse(data),
  )
  .handler(({ data, context }) =>
    run(() => m.playMove(toActor(context.user), data.id, data.cell, origin())),
  );

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    const { id, ...rest } = z
      .object({ id: z.string().min(1).max(64) })
      .passthrough()
      .parse(data);
    return { id, message: m.messageInput.parse(rest) };
  })
  .handler(({ data, context }) =>
    run(() => m.sendMessage(toActor(context.user), data.id, data.message)),
  );

export const getQueue = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => q.getQueue(toActor(context.user)));

export const joinQueue = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ game: gameInput }).strict().parse(data),
  )
  .handler(({ data, context }) =>
    q.joinQueue(toActor(context.user), data.game),
  );

export const leaveQueue = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => q.leaveQueue(toActor(context.user)));

export const getHistory = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => m.listHistory(toActor(context.user)));

export const getRankings = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ game: gameInput }).strict().parse(data),
  )
  .handler(({ data }) => listRankings(data.game));

export const getTournaments = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => t.listTournaments(toActor(context.user)));

export const createTournament = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => t.createTournamentInput.parse(data))
  .handler(({ data, context }) =>
    run(() => t.createTournament(toActor(context.user), data, origin())),
  );

export const getTournament = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(({ data, context }) =>
    run(() => t.getTournament(toActor(context.user), data.id, origin())),
  );

const tournamentAction = z
  .object({
    id: z.string().min(1).max(64),
    action: z.enum(["join", "leave", "start", "stop", "delete"]),
  })
  .strict();

export const tournamentCommand = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => tournamentAction.parse(data))
  .handler(({ data, context }) =>
    run(async () => {
      const actor = toActor(context.user);
      switch (data.action) {
        case "join":
          return t.joinTournament(actor, data.id, origin());
        case "leave":
          return t.leaveTournament(actor, data.id, origin());
        case "start":
          return t.startTournament(actor, data.id, origin());
        case "stop":
          return t.stopTournament(actor, data.id, origin());
        case "delete":
          await t.deleteTournament(actor, data.id);
          return null;
      }
    }),
  );

export const editTournament = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    const { id, ...rest } = z
      .object({ id: z.string().min(1).max(64) })
      .passthrough()
      .parse(data);
    return { id, change: t.editTournamentInput.parse(rest) };
  })
  .handler(({ data, context }) =>
    run(() =>
      t.editTournament(toActor(context.user), data.id, data.change, origin()),
    ),
  );
