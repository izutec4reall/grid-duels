import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { matches, queue } from "@/db/schema";
import type { Game } from "@/lib/rules";
import { ensurePlayer, now, type Actor } from "./core";
import { newMatchRow } from "./matches";

export type QueueState =
  | { state: "idle" }
  | { state: "waiting"; game: Game; since: string }
  | { state: "matched"; matchId: string };

/** Pairs the member with the longest-waiting other member for the game, if any. */
async function tryPair(actor: Actor, game: Game): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [waiting] = await db
      .select()
      .from(queue)
      .where(
        and(
          eq(queue.game, game),
          isNull(queue.matchId),
          ne(queue.userId, actor.id),
        ),
      )
      .orderBy(asc(queue.createdAt))
      .limit(1);
    if (!waiting) return null;
    const row = newMatchRow({
      game,
      kind: "online",
      playerA: waiting.userId,
      playerB: actor.id,
    });
    await db.insert(matches).values(row);
    // Claim the other member; if someone else got them first, try the next one.
    const claimed = await db
      .update(queue)
      .set({ matchId: row.id })
      .where(
        and(
          eq(queue.userId, waiting.userId),
          isNull(queue.matchId),
          eq(queue.game, game),
        ),
      )
      .returning({ userId: queue.userId });
    if (claimed.length > 0) {
      await db.delete(queue).where(eq(queue.userId, actor.id));
      return row.id;
    }
    await db.delete(matches).where(eq(matches.id, row.id));
  }
  return null;
}

/** Enters the game's queue, leaving any other; pairs at once when someone waits. */
export async function joinQueue(actor: Actor, game: Game): Promise<QueueState> {
  await ensurePlayer(actor);
  await db.delete(queue).where(eq(queue.userId, actor.id));
  const matchId = await tryPair(actor, game);
  if (matchId) return { state: "matched", matchId };
  const since = now();
  await db.insert(queue).values({ userId: actor.id, game, createdAt: since });
  // Two members who joined together both missed each other: check once more.
  const late = await getQueue(actor);
  return late;
}

/** The member's place in the queue. A pairing is reported once, then cleared. */
export async function getQueue(actor: Actor): Promise<QueueState> {
  const [entry] = await db
    .select()
    .from(queue)
    .where(eq(queue.userId, actor.id));
  if (!entry) return { state: "idle" };
  if (entry.matchId) {
    await db
      .delete(queue)
      .where(and(eq(queue.userId, actor.id), eq(queue.matchId, entry.matchId)));
    return { state: "matched", matchId: entry.matchId };
  }
  const game = entry.game as Game;
  const matchId = await tryPair(actor, game);
  if (matchId) return { state: "matched", matchId };
  return { state: "waiting", game, since: entry.createdAt };
}

export async function leaveQueue(actor: Actor): Promise<QueueState> {
  await db
    .delete(queue)
    .where(and(eq(queue.userId, actor.id), isNull(queue.matchId)));
  return getQueue(actor);
}
