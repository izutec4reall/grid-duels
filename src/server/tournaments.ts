import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { matches, tournamentPlayers, tournaments } from "@/db/schema";
import { bracketPairs, POINTS, roundRobinRounds, type Game } from "@/lib/rules";
import {
  AppError,
  ensurePlayer,
  gameInput,
  namesFor,
  now,
  shuffle,
  type Actor,
} from "./core";
import { newMatchRow, type MatchRow } from "./matches";

export const MODES = [
  "leaderboard",
  "single-elimination",
  "round-robin",
] as const;
export type Mode = (typeof MODES)[number];

const nameInput = z
  .string()
  .trim()
  .min(1, "Give it a name")
  .max(80, "80 characters at most");
export const createTournamentInput = z
  .object({ name: nameInput, game: gameInput, mode: z.enum(MODES) })
  .strict();
export const editTournamentInput = z
  .object({
    name: nameInput.optional(),
    game: gameInput.optional(),
    mode: z.enum(MODES).optional(),
  })
  .strict();

type TournamentRow = typeof tournaments.$inferSelect;

async function load(id: string): Promise<TournamentRow> {
  const [row] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id));
  if (!row) throw new AppError(404, "No tournament with that link");
  return row;
}

function assertManager(actor: Actor, row: TournamentRow) {
  if (row.organizerId !== actor.id && !actor.admin) {
    throw new AppError(403, "Only the organizer can do that");
  }
}

const canJoinNow = (row: TournamentRow) =>
  row.status === "open" ||
  (row.status === "running" && row.mode === "leaderboard");

export async function createTournament(
  actor: Actor,
  input: z.infer<typeof createTournamentInput>,
  origin: string,
) {
  await ensurePlayer(actor);
  const id = crypto.randomUUID();
  const at = now();
  await db.batch([
    db
      .insert(tournaments)
      .values({ id, ...input, organizerId: actor.id, createdAt: at }),
    db
      .insert(tournamentPlayers)
      .values({ tournamentId: id, userId: actor.id, joinedAt: at }),
  ]);
  return getTournament(actor, id, origin);
}

export async function editTournament(
  actor: Actor,
  id: string,
  input: z.infer<typeof editTournamentInput>,
  origin: string,
) {
  const row = await load(id);
  assertManager(actor, row);
  if ((input.game || input.mode) && row.status !== "open") {
    throw new AppError(409, "The game and format are fixed once it starts");
  }
  if (Object.keys(input).length > 0) {
    await db.update(tournaments).set(input).where(eq(tournaments.id, id));
  }
  return getTournament(actor, id, origin);
}

export async function deleteTournament(
  actor: Actor,
  id: string,
): Promise<void> {
  const row = await load(id);
  assertManager(actor, row);
  await db.batch([
    db.delete(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, id)),
    db.delete(tournaments).where(eq(tournaments.id, id)),
  ]);
}

export async function joinTournament(actor: Actor, id: string, origin: string) {
  const row = await load(id);
  if (!canJoinNow(row))
    throw new AppError(409, "This tournament has already started");
  await ensurePlayer(actor);
  await db
    .insert(tournamentPlayers)
    .values({ tournamentId: id, userId: actor.id, joinedAt: now() })
    .onConflictDoNothing();
  if (row.status === "running") await pairLeaderboard(row);
  return getTournament(actor, id, origin);
}

export async function leaveTournament(
  actor: Actor,
  id: string,
  origin: string,
) {
  const row = await load(id);
  if (row.status !== "open")
    throw new AppError(409, "You can't leave once it has started");
  await db
    .delete(tournamentPlayers)
    .where(
      and(
        eq(tournamentPlayers.tournamentId, id),
        eq(tournamentPlayers.userId, actor.id),
      ),
    );
  return getTournament(actor, id, origin);
}

export async function startTournament(
  actor: Actor,
  id: string,
  origin: string,
) {
  const row = await load(id);
  assertManager(actor, row);
  if (row.status !== "open") throw new AppError(409, "It has already started");
  const entrants = await db
    .select({ userId: tournamentPlayers.userId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, id));
  if (entrants.length < 2)
    throw new AppError(409, "It needs at least two players");
  const [started] = await db
    .update(tournaments)
    .set({ status: "running", startedAt: now() })
    .where(and(eq(tournaments.id, id), eq(tournaments.status, "open")))
    .returning();
  if (!started) throw new AppError(409, "It has already started");
  const game = row.game as Game;
  const seeded = shuffle(entrants.map((e) => e.userId));
  const base = {
    game,
    kind: "tournament" as const,
    tournamentId: id,
    attempt: 0,
  };
  if (row.mode === "round-robin") {
    const rows = roundRobinRounds(seeded).flatMap((pairs, r) =>
      pairs.map(([a, b], slot) =>
        newMatchRow({ ...base, playerA: a, playerB: b, round: r + 1, slot }),
      ),
    );
    await db.insert(matches).values(rows);
  } else if (row.mode === "single-elimination") {
    const rows = bracketPairs(seeded).map(([a, b], slot) =>
      newMatchRow({
        ...base,
        playerA: a,
        playerB: b,
        round: 1,
        slot,
        bye: b === null,
      }),
    );
    await db.insert(matches).values(rows);
    await advanceBracket(started);
  } else {
    await pairLeaderboard(started);
  }
  return getTournament(actor, id, origin);
}

export async function stopTournament(actor: Actor, id: string, origin: string) {
  const row = await load(id);
  assertManager(actor, row);
  if (row.status !== "running") throw new AppError(409, "It isn't running");
  const { standings } = await standingsFor(row);
  await finish(row.id, standings[0]?.userId ?? null);
  return getTournament(actor, id, origin);
}

async function finish(id: string, winnerId: string | null) {
  await db
    .update(tournaments)
    .set({ status: "finished", winnerId, finishedAt: now() })
    .where(and(eq(tournaments.id, id), eq(tournaments.status, "running")));
}

/** Called when one of the tournament's matches ends. */
export async function onTournamentMatchFinished(id: string, matchId: string) {
  const [row] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id));
  if (!row || row.status !== "running") return;
  if (row.mode === "leaderboard") {
    await db
      .update(tournamentPlayers)
      .set({ currentMatchId: null })
      .where(
        and(
          eq(tournamentPlayers.tournamentId, id),
          eq(tournamentPlayers.currentMatchId, matchId),
        ),
      );
    await pairLeaderboard(row);
  } else if (row.mode === "single-elimination") {
    await advanceBracket(row);
  } else {
    const open = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(eq(matches.tournamentId, id), sql`${matches.status} != 'finished'`),
      )
      .limit(1);
    if (open.length === 0) {
      const { standings } = await standingsFor(row);
      await finish(id, standings[0]?.userId ?? null);
    }
  }
}

/** Leaderboard: pairs every two players who aren't in a match. */
async function pairLeaderboard(row: TournamentRow) {
  if (row.mode !== "leaderboard" || row.status !== "running") return;
  const free = await db
    .select({ userId: tournamentPlayers.userId })
    .from(tournamentPlayers)
    .where(
      and(
        eq(tournamentPlayers.tournamentId, row.id),
        sql`${tournamentPlayers.currentMatchId} is null`,
      ),
    );
  const order = shuffle(free.map((f) => f.userId));
  for (let i = 0; i + 1 < order.length; i += 2) {
    const a = order[i]!;
    const b = order[i + 1]!;
    const match = newMatchRow({
      game: row.game as Game,
      kind: "tournament",
      playerA: a,
      playerB: b,
      tournamentId: row.id,
    });
    // Both players are claimed in one statement, or neither is.
    const claimed = await db.run(sql`
      update tournament_players set current_match_id = ${match.id}
      where tournament_id = ${row.id} and user_id in (${a}, ${b}) and current_match_id is null
        and (select count(*) from tournament_players
             where tournament_id = ${row.id} and user_id in (${a}, ${b}) and current_match_id is null) = 2`);
    if (claimed.meta.changes === 2) await db.insert(matches).values(match);
  }
}

/** Single elimination: replays draws, then builds the next round or crowns the champion. */
async function advanceBracket(row: TournamentRow) {
  const all = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, row.id));
  if (all.length === 0) return;
  const round = Math.max(...all.map((m) => m.round ?? 0));
  const latest = new Map<number, MatchRow>();
  for (const m of all.filter((m) => m.round === round)) {
    const seen = latest.get(m.slot!);
    if (!seen || (m.attempt ?? 0) > (seen.attempt ?? 0)) latest.set(m.slot!, m);
  }
  const slots = [...latest.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, m]) => m);
  if (slots.some((m) => m.status !== "finished")) return;
  const draws = slots.filter((m) => m.winnerSeat === null);
  if (draws.length > 0) {
    await db
      .insert(matches)
      .values(
        draws.map((m) =>
          newMatchRow({
            game: row.game as Game,
            kind: "tournament",
            playerA: m.playerA,
            playerB: m.playerB,
            firstSeat: m.firstSeat === "a" ? "b" : "a",
            tournamentId: row.id,
            round,
            slot: m.slot!,
            attempt: (m.attempt ?? 0) + 1,
          }),
        ),
      )
      .onConflictDoNothing();
    return;
  }
  const winners = slots.map((m) =>
    m.winnerSeat === "a" ? m.playerA : m.playerB!,
  );
  if (winners.length === 1) {
    await finish(row.id, winners[0]!);
    return;
  }
  const next = [];
  for (let i = 0; i < winners.length; i += 2) {
    next.push(
      newMatchRow({
        game: row.game as Game,
        kind: "tournament",
        playerA: winners[i]!,
        playerB: winners[i + 1] ?? null,
        bye: winners[i + 1] === undefined,
        tournamentId: row.id,
        round: round + 1,
        slot: i / 2,
        attempt: 0,
      }),
    );
  }
  await db.insert(matches).values(next).onConflictDoNothing();
  // A bye-only round (never with a full bracket) would need another step.
  if (next.every((m) => m.status === "finished")) await advanceBracket(row);
}

async function standingsFor(row: TournamentRow) {
  const [entrants, played] = await Promise.all([
    db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, row.id)),
    db.select().from(matches).where(eq(matches.tournamentId, row.id)),
  ]);
  const names = await namesFor([
    ...entrants.map((e) => e.userId),
    ...played.flatMap((m) => [m.playerA, m.playerB]),
    row.organizerId,
    row.winnerId,
  ]);
  const table = new Map(
    entrants.map((e) => [
      e.userId,
      {
        userId: e.userId,
        name: names.get(e.userId) ?? "Member",
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        eliminated: false,
      },
    ]),
  );
  for (const m of played) {
    if (m.status !== "finished" || m.result === "bye" || !m.playerB) continue;
    const a = table.get(m.playerA);
    const b = table.get(m.playerB);
    const winner = m.winnerSeat === "a" ? a : m.winnerSeat === "b" ? b : null;
    const loser = m.winnerSeat === "a" ? b : m.winnerSeat === "b" ? a : null;
    if (!m.winnerSeat) {
      for (const p of [a, b])
        if (p) {
          p.draws++;
          p.points += POINTS.draw;
        }
    } else {
      if (winner) {
        winner.wins++;
        winner.points += POINTS.win;
      }
      if (loser) {
        loser.losses++;
        if (row.mode === "single-elimination") loser.eliminated = true;
      }
    }
  }
  const standings = [...table.values()].sort(
    (x, y) =>
      y.points - x.points || y.wins - x.wins || x.name.localeCompare(y.name),
  );
  return { standings, played, names, entrants };
}

export async function getTournament(actor: Actor, id: string, origin: string) {
  let row = await load(id);
  if (row.mode === "leaderboard" && row.status === "running") {
    await pairLeaderboard(row);
    row = await load(id);
  }
  const { standings, played, names, entrants } = await standingsFor(row);
  const person = (userId: string | null) =>
    userId ? { id: userId, name: names.get(userId) ?? "Member" } : null;
  const joined = entrants.some((e) => e.userId === actor.id);
  return {
    id: row.id,
    url: new URL(`/tournaments/${row.id}`, origin).toString(),
    name: row.name,
    game: row.game as Game,
    mode: row.mode as Mode,
    status: row.status as "open" | "running" | "finished",
    organizer: person(row.organizerId)!,
    winner: person(row.winnerId),
    players: entrants
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((e) => person(e.userId)!),
    standings,
    matches: played
      .sort(
        (a, b) =>
          (a.round ?? 0) - (b.round ?? 0) ||
          (a.slot ?? 0) - (b.slot ?? 0) ||
          (a.attempt ?? 0) - (b.attempt ?? 0) ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .map((m) => ({
        id: m.id,
        round: m.round,
        slot: m.slot,
        bye: m.result === "bye",
        a: person(m.playerA)!,
        b: person(m.playerB),
        status: m.status as "waiting" | "active" | "finished",
        result: m.result,
        winnerId:
          m.winnerSeat === "a"
            ? m.playerA
            : m.winnerSeat === "b"
              ? m.playerB
              : null,
      })),
    joined,
    canJoin: !joined && canJoinNow(row),
    canLeave: joined && row.status === "open",
    canManage: row.organizerId === actor.id || actor.admin,
    createdAt: row.createdAt,
  };
}

export type TournamentView = Awaited<ReturnType<typeof getTournament>>;

export async function listTournaments(actor: Actor) {
  const mineIds = db
    .select({ id: tournamentPlayers.tournamentId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.userId, actor.id));
  const rows = await db
    .select()
    .from(tournaments)
    .where(
      or(
        eq(tournaments.organizerId, actor.id),
        inArray(tournaments.id, mineIds),
        eq(tournaments.status, "open"),
        and(
          eq(tournaments.status, "running"),
          eq(tournaments.mode, "leaderboard"),
        ),
      ),
    )
    .orderBy(desc(tournaments.createdAt))
    .limit(200);
  const counts = rows.length
    ? await db
        .select({
          id: tournamentPlayers.tournamentId,
          n: sql<number>`count(*)`,
        })
        .from(tournamentPlayers)
        .where(
          inArray(
            tournamentPlayers.tournamentId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(tournamentPlayers.tournamentId)
    : [];
  const mine = new Set((await mineIds).map((r) => r.id));
  const item = (r: TournamentRow) => ({
    id: r.id,
    name: r.name,
    game: r.game as Game,
    mode: r.mode as Mode,
    status: r.status as "open" | "running" | "finished",
    players: counts.find((c) => c.id === r.id)?.n ?? 0,
  });
  return {
    mine: rows
      .filter((r) => r.organizerId === actor.id || mine.has(r.id))
      .map(item),
    open: rows.filter((r) => canJoinNow(r) && !mine.has(r.id)).map(item),
  };
}
