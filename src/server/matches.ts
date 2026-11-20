import { and, asc, desc, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { matches, messages, tournaments } from "@/db/schema";
import {
  computerMove,
  inRange,
  outcome,
  boardFrom,
  resolveMove,
  SPECS,
  type Game,
} from "@/lib/rules";
import { REACTIONS } from "@/lib/reactions";
import {
  AppError,
  COMPUTER,
  ensurePlayer,
  gameInput,
  namesFor,
  now,
  type Actor,
} from "./core";
import { recordRatedResult } from "./ratings";
import { onTournamentMatchFinished } from "./tournaments";

export type MatchRow = typeof matches.$inferSelect;
type Seat = "a" | "b";

export const createMatchInput = z
  .object({ game: gameInput, opponent: z.enum(["friend", "computer"]) })
  .strict();
export const moveInput = z.object({ cell: z.number().int() }).strict();
export const messageInput = z.union([
  z
    .object({
      body: z
        .string()
        .trim()
        .min(1, "Write a message")
        .max(200, "200 characters at most"),
    })
    .strict(),
  z.object({ emoji: z.enum(REACTIONS) }).strict(),
]);

const other = (seat: Seat): Seat => (seat === "a" ? "b" : "a");
const movesOf = (row: MatchRow): number[] => JSON.parse(row.moves) as number[];
const userAt = (row: MatchRow, seat: Seat | null) =>
  seat === "a" ? row.playerA : seat === "b" ? row.playerB : null;

function seatOf(row: MatchRow, userId: string): Seat | null {
  if (row.playerA === userId) return "a";
  if (row.playerB === userId) return "b";
  return null;
}

function turnSeat(row: MatchRow): Seat | null {
  if (row.status !== "active") return null;
  const first = row.firstSeat as Seat;
  return movesOf(row).length % 2 === 0 ? first : other(first);
}

/** A match against the computer is its player's alone; any other one opens from its link. */
function canView(row: MatchRow, userId: string): boolean {
  return row.kind !== "computer" || row.playerA === userId;
}

async function load(actor: Actor, id: string): Promise<MatchRow> {
  const [row] = await db.select().from(matches).where(eq(matches.id, id));
  if (!row || !canView(row, actor.id) || row.result === "bye") {
    throw new AppError(404, "No match with that link");
  }
  return row;
}

/** Writes a change only if nobody else changed the match since it was read. */
async function write(
  row: MatchRow,
  change: Partial<MatchRow>,
): Promise<MatchRow> {
  const [updated] = await db
    .update(matches)
    .set({ ...change, version: row.version + 1, updatedAt: now() })
    .where(and(eq(matches.id, row.id), eq(matches.version, row.version)))
    .returning();
  if (!updated) throw new AppError(409, "The board changed. Try again.");
  return updated;
}

/** Plays the computer's reply when it is its turn. */
function withComputer(row: MatchRow, moves: number[]): number[] {
  if (row.playerB !== COMPUTER) return moves;
  const first = row.firstSeat as Seat;
  const next = moves.length % 2 === 0 ? first : other(first);
  if (next !== "b" || outcome(row.game as Game, moves).winner) return moves;
  return [...moves, computerMove(row.game as Game, moves)];
}

/** The fields that end a match, when the moves ended it. */
function finishFields(row: MatchRow, moves: number[]): Partial<MatchRow> {
  const { winner } = outcome(row.game as Game, moves);
  if (!winner) return {};
  const first = row.firstSeat as Seat;
  return {
    status: "finished",
    result: winner === "draw" ? "draw" : "win",
    winnerSeat:
      winner === "draw" ? null : winner === "first" ? first : other(first),
    finishedAt: now(),
  };
}

/** Ratings and tournament progress once a match ends. */
async function afterFinish(row: MatchRow): Promise<void> {
  if (row.status !== "finished" || row.result === "bye") return;
  if (row.playerB && row.playerB !== COMPUTER) {
    const score = row.winnerSeat === "a" ? 1 : row.winnerSeat === "b" ? 0 : 0.5;
    await recordRatedResult(row.game as Game, row.playerA, row.playerB, score);
  }
  if (row.tournamentId)
    await onTournamentMatchFinished(row.tournamentId, row.id);
}

export interface NewMatch {
  game: Game;
  kind: "friend" | "online" | "computer" | "tournament";
  playerA: string;
  playerB: string | null;
  firstSeat?: Seat;
  tournamentId?: string;
  round?: number;
  slot?: number;
  attempt?: number;
  bye?: boolean;
}

/** The row for a new match; a bye is a finished match the first player wins. */
export function newMatchRow(spec: NewMatch): typeof matches.$inferInsert {
  const at = now();
  const firstSeat = spec.firstSeat ?? (Math.random() < 0.5 ? "a" : "b");
  const base = {
    id: crypto.randomUUID(),
    game: spec.game,
    kind: spec.kind,
    playerA: spec.playerA,
    playerB: spec.playerB,
    firstSeat,
    tournamentId: spec.tournamentId ?? null,
    round: spec.round ?? null,
    slot: spec.slot ?? null,
    attempt: spec.attempt ?? null,
    createdAt: at,
    updatedAt: at,
  };
  if (spec.bye) {
    return {
      ...base,
      status: "finished",
      result: "bye",
      winnerSeat: "a",
      startedAt: at,
      finishedAt: at,
    };
  }
  if (!spec.playerB) return { ...base, status: "waiting" };
  let moves: number[] = [];
  if (spec.playerB === COMPUTER && firstSeat === "b")
    moves = [computerMove(spec.game, [])];
  return {
    ...base,
    status: "active",
    startedAt: at,
    moves: JSON.stringify(moves),
  };
}

export async function createMatch(
  actor: Actor,
  input: z.infer<typeof createMatchInput>,
  origin: string,
) {
  await ensurePlayer(actor);
  const values = newMatchRow({
    game: input.game,
    kind: input.opponent,
    playerA: actor.id,
    playerB: input.opponent === "computer" ? COMPUTER : null,
  });
  await db.insert(matches).values(values);
  return getMatch(actor, values.id, origin);
}

export async function joinMatch(actor: Actor, id: string, origin: string) {
  const row = await load(actor, id);
  if (row.status !== "waiting" || row.playerB)
    throw new AppError(409, "This match already has two players");
  if (row.playerA === actor.id)
    throw new AppError(
      409,
      "You created this match. Share the link with someone else.",
    );
  await ensurePlayer(actor);
  const [joined] = await db
    .update(matches)
    .set({
      playerB: actor.id,
      status: "active",
      startedAt: now(),
      updatedAt: now(),
      version: row.version + 1,
    })
    .where(
      and(
        eq(matches.id, id),
        eq(matches.status, "waiting"),
        isNull(matches.playerB),
      ),
    )
    .returning();
  if (!joined) throw new AppError(409, "Someone else joined first");
  return getMatch(actor, id, origin);
}

export async function playMove(
  actor: Actor,
  id: string,
  cell: number,
  origin: string,
) {
  const row = await load(actor, id);
  const seat = seatOf(row, actor.id);
  if (!seat) throw new AppError(403, "Only the two players can move");
  if (row.status === "waiting")
    throw new AppError(409, "Waiting for an opponent");
  if (row.status !== "active") throw new AppError(409, "This match is over");
  if (turnSeat(row) !== seat) throw new AppError(409, "It's not your turn");
  const game = row.game as Game;
  if (!inRange(game, cell)) throw new AppError(400, "No such cell");
  const moves = movesOf(row);
  const at = resolveMove(game, boardFrom(game, moves), cell);
  if (at === null)
    throw new AppError(
      409,
      SPECS[game].gravity ? "That column is full" : "That cell is taken",
    );
  const all = withComputer(row, [...moves, at]);
  const updated = await write(row, {
    moves: JSON.stringify(all),
    ...finishFields(row, all),
  });
  await afterFinish(updated);
  return getMatch(actor, id, origin);
}

export async function resign(actor: Actor, id: string, origin: string) {
  const row = await load(actor, id);
  const seat = seatOf(row, actor.id);
  if (!seat) throw new AppError(403, "Only the two players can resign");
  if (row.status !== "active")
    throw new AppError(409, "This match isn't being played");
  const updated = await write(row, {
    status: "finished",
    result: "resign",
    winnerSeat: other(seat),
    finishedAt: now(),
  });
  await afterFinish(updated);
  return getMatch(actor, id, origin);
}

export async function cancelMatch(actor: Actor, id: string): Promise<void> {
  const row = await load(actor, id);
  if (row.playerA !== actor.id)
    throw new AppError(403, "Only the creator can cancel");
  if (row.status !== "waiting")
    throw new AppError(409, "Someone already joined");
  const gone = await db
    .delete(matches)
    .where(and(eq(matches.id, id), eq(matches.status, "waiting")))
    .returning({ id: matches.id });
  if (gone.length === 0) throw new AppError(409, "Someone already joined");
}

export async function offerRematch(actor: Actor, id: string, origin: string) {
  const row = await load(actor, id);
  const seat = seatOf(row, actor.id);
  if (!seat)
    throw new AppError(403, "Only the two players can ask for a rematch");
  if (row.status !== "finished" || row.tournamentId)
    throw new AppError(409, "No rematch for this match");
  if (row.rematchId) return getMatch(actor, id, origin);
  const flags = {
    rematchA: seat === "a" || row.rematchA,
    rematchB: seat === "b" || row.rematchB || row.playerB === COMPUTER,
  };
  if (!(flags.rematchA && flags.rematchB)) {
    await write(row, flags);
    return getMatch(actor, id, origin);
  }
  // Whoever moved second last time moves first now.
  const next = newMatchRow({
    game: row.game as Game,
    kind: row.kind as NewMatch["kind"],
    playerA: row.playerA,
    playerB: row.playerB,
    firstSeat: other(row.firstSeat as Seat),
  });
  await write(row, { ...flags, rematchId: next.id });
  await db.insert(matches).values(next);
  return getMatch(actor, id, origin);
}

export async function sendMessage(
  actor: Actor,
  id: string,
  input: z.infer<typeof messageInput>,
) {
  const row = await load(actor, id);
  if (!seatOf(row, actor.id))
    throw new AppError(403, "Only the players can chat");
  const values = {
    id: crypto.randomUUID(),
    matchId: id,
    userId: actor.id,
    kind: "emoji" in input ? "emoji" : "text",
    body: "emoji" in input ? input.emoji : input.body,
    createdAt: now(),
  };
  await db.insert(messages).values(values);
  return {
    id: values.id,
    kind: values.kind,
    body: values.body,
    createdAt: values.createdAt,
  };
}

export async function getMatch(actor: Actor, id: string, origin: string) {
  const row = await load(actor, id);
  const [names, chat, tournament] = await Promise.all([
    namesFor([row.playerA, row.playerB]),
    db
      .select()
      .from(messages)
      .where(eq(messages.matchId, id))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(500),
    row.tournamentId
      ? db
          .select({ id: tournaments.id, name: tournaments.name })
          .from(tournaments)
          .where(eq(tournaments.id, row.tournamentId))
      : Promise.resolve([]),
  ]);
  const chatNames = await namesFor(chat.map((m) => m.userId));
  const seat = seatOf(row, actor.id);
  const turn = turnSeat(row);
  const moves = movesOf(row);
  const person = (userId: string | null) =>
    userId ? { id: userId, name: names.get(userId) ?? "Member" } : null;
  return {
    id: row.id,
    url: new URL(`/play/${row.id}`, origin).toString(),
    game: row.game as Game,
    kind: row.kind,
    status: row.status as "waiting" | "active" | "finished",
    result: row.result as "win" | "draw" | "resign" | null,
    winnerId: userAt(row, row.winnerSeat as Seat | null),
    winLine:
      row.status === "finished" && row.result === "win"
        ? outcome(row.game as Game, moves).line
        : [],
    moves,
    firstUserId: userAt(row, row.firstSeat as Seat),
    turnUserId: userAt(row, turn),
    players: { a: person(row.playerA)!, b: person(row.playerB) },
    mySeat: seat,
    canMove: !!seat && turn === seat,
    canJoin: row.status === "waiting" && row.playerA !== actor.id,
    canCancel: row.status === "waiting" && row.playerA === actor.id,
    canChat: !!seat,
    canRematch: !!seat && row.status === "finished" && !row.tournamentId,
    rematch: { a: row.rematchA, b: row.rematchB },
    rematchMatchId: row.rematchId,
    tournament: tournament[0] ?? null,
    messages: chat.map((m) => ({
      id: m.id,
      kind: m.kind as "text" | "emoji",
      body: m.body,
      name: chatNames.get(m.userId) ?? "Member",
      mine: m.userId === actor.id,
      createdAt: m.createdAt,
    })),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export type MatchView = Awaited<ReturnType<typeof getMatch>>;

/** The member's matches still waiting or being played. */
export async function listOpenMatches(actor: Actor) {
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        or(eq(matches.playerA, actor.id), eq(matches.playerB, actor.id)),
        ne(matches.status, "finished"),
      ),
    )
    .orderBy(desc(matches.updatedAt))
    .limit(50);
  const names = await namesFor(rows.flatMap((r) => [r.playerA, r.playerB]));
  return rows.map((r) => {
    const opp = r.playerA === actor.id ? r.playerB : r.playerA;
    return {
      id: r.id,
      game: r.game as Game,
      status: r.status as "waiting" | "active",
      opponent: opp ? (names.get(opp) ?? "Member") : null,
      myTurn: turnSeat(r) === seatOf(r, actor.id),
    };
  });
}

/** The member's finished matches, newest first. */
export async function listHistory(actor: Actor) {
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        or(eq(matches.playerA, actor.id), eq(matches.playerB, actor.id)),
        eq(matches.status, "finished"),
        ne(matches.result, "bye"),
      ),
    )
    .orderBy(desc(matches.finishedAt))
    .limit(200);
  const names = await namesFor(rows.flatMap((r) => [r.playerA, r.playerB]));
  return rows.map((r) => {
    const seat = seatOf(r, actor.id)!;
    const opp = seat === "a" ? r.playerB : r.playerA;
    return {
      id: r.id,
      game: r.game as Game,
      opponent: opp ? (names.get(opp) ?? "Member") : "",
      result: (r.winnerSeat === null
        ? "draw"
        : r.winnerSeat === seat
          ? "win"
          : "loss") as "win" | "loss" | "draw",
      byResignation: r.result === "resign",
      rated: r.playerB !== COMPUTER,
      finishedAt: r.finishedAt,
    };
  });
}
