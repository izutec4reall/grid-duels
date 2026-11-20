import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(current_timestamp)`;

/** One row per member who has used the app, keyed by the Gateway's user id. */
export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    game: text("game").notNull(),
    /** friend | online | computer | tournament */
    kind: text("kind").notNull(),
    playerA: text("player_a").notNull(),
    /** Null while a friend match waits; "computer" against the computer. */
    playerB: text("player_b"),
    /** The seat that moves first: "a" or "b". */
    firstSeat: text("first_seat").notNull(),
    /** Cell indexes in the order played, as JSON. */
    moves: text("moves").notNull().default("[]"),
    /** waiting | active | finished */
    status: text("status").notNull(),
    /** win | draw | resign | bye */
    result: text("result"),
    winnerSeat: text("winner_seat"),
    rematchA: integer("rematch_a", { mode: "boolean" })
      .notNull()
      .default(false),
    rematchB: integer("rematch_b", { mode: "boolean" })
      .notNull()
      .default(false),
    rematchId: text("rematch_id"),
    tournamentId: text("tournament_id"),
    round: integer("round"),
    slot: integer("slot"),
    attempt: integer("attempt"),
    /** Bumped on every write; a write that read an older one is refused. */
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    index("matches_player_a").on(t.playerA, t.status),
    index("matches_player_b").on(t.playerB, t.status),
    index("matches_tournament").on(t.tournamentId),
    uniqueIndex("matches_bracket_slot").on(
      t.tournamentId,
      t.round,
      t.slot,
      t.attempt,
    ),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull(),
    userId: text("user_id").notNull(),
    /** text | emoji */
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("messages_match").on(t.matchId, t.createdAt)],
);

/** At most one queue entry per member. matchId is set when they are paired. */
export const queue = sqliteTable("queue", {
  userId: text("user_id").primaryKey(),
  game: text("game").notNull(),
  matchId: text("match_id"),
  createdAt: text("created_at").notNull().default(now),
});

export const ratings = sqliteTable(
  "ratings",
  {
    userId: text("user_id").notNull(),
    game: text("game").notNull(),
    rating: real("rating").notNull().default(1200),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.game] })],
);

export const tournaments = sqliteTable("tournaments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  game: text("game").notNull(),
  /** leaderboard | single-elimination | round-robin */
  mode: text("mode").notNull(),
  organizerId: text("organizer_id").notNull(),
  /** open | running | finished */
  status: text("status").notNull().default("open"),
  winnerId: text("winner_id"),
  createdAt: text("created_at").notNull().default(now),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const tournamentPlayers = sqliteTable(
  "tournament_players",
  {
    tournamentId: text("tournament_id").notNull(),
    userId: text("user_id").notNull(),
    /** Leaderboard only: the match the player is in now. */
    currentMatchId: text("current_match_id"),
    joinedAt: text("joined_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.userId] })],
);
