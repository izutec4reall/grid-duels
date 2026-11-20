import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { players, ratings } from "@/db/schema";
import { elo, type Game } from "@/lib/rules";
import { displayName } from "./core";

/** Updates both players' ratings and records after a finished human game. */
export async function recordRatedResult(
  game: Game,
  a: string,
  b: string,
  /** 1 when a won, 0.5 draw, 0 when b won. */
  score: number,
): Promise<void> {
  await db
    .insert(ratings)
    .values([
      { userId: a, game },
      { userId: b, game },
    ])
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(ratings)
    .where(and(eq(ratings.game, game), sql`${ratings.userId} in (${a}, ${b})`));
  const ra = rows.find((r) => r.userId === a)?.rating ?? 1200;
  const rb = rows.find((r) => r.userId === b)?.rating ?? 1200;
  const [na] = elo(ra, rb, score);
  const delta = na - ra;
  const counters = (s: number) => ({
    wins: s === 1 ? sql`${ratings.wins} + 1` : ratings.wins,
    losses: s === 0 ? sql`${ratings.losses} + 1` : ratings.losses,
    draws: s === 0.5 ? sql`${ratings.draws} + 1` : ratings.draws,
  });
  // Relative updates, so two games finishing together both count.
  await db.batch([
    db
      .update(ratings)
      .set({ rating: sql`${ratings.rating} + ${delta}`, ...counters(score) })
      .where(and(eq(ratings.userId, a), eq(ratings.game, game))),
    db
      .update(ratings)
      .set({
        rating: sql`${ratings.rating} - ${delta}`,
        ...counters(1 - score),
      })
      .where(and(eq(ratings.userId, b), eq(ratings.game, game))),
  ]);
}

export interface RankingRow {
  userId: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export async function listRankings(game: Game): Promise<RankingRow[]> {
  const rows = await db
    .select({
      userId: ratings.userId,
      email: players.email,
      rating: ratings.rating,
      wins: ratings.wins,
      losses: ratings.losses,
      draws: ratings.draws,
    })
    .from(ratings)
    .innerJoin(players, eq(players.id, ratings.userId))
    .where(eq(ratings.game, game))
    .orderBy(desc(ratings.rating), desc(ratings.wins))
    .limit(200);
  return rows.map(({ email, rating, ...row }) => ({
    ...row,
    name: displayName(email),
    rating: Math.round(rating),
  }));
}
