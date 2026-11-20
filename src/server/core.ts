import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { players } from "@/db/schema";
import { GAMES } from "@/lib/rules";

/** A refusal with the HTTP status the API answers with. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The signed-in member, as the server code needs them. */
export interface Actor {
  id: string;
  email: string;
  admin: boolean;
}

export const COMPUTER = "computer";

export const gameInput = z.enum(GAMES);

export function now(): string {
  return new Date().toISOString();
}

export function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Records the member on first sight; the email follows the Gateway's. */
export async function ensurePlayer(actor: Actor): Promise<void> {
  await db
    .insert(players)
    .values({ id: actor.id, email: actor.email, createdAt: now() })
    .onConflictDoUpdate({ target: players.id, set: { email: actor.email } });
}

export function displayName(email: string): string {
  return email.split("@")[0] || email;
}

/** Display names by user id; the computer is "Computer". */
export async function namesFor(
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [
    ...new Set(ids.filter((id): id is string => !!id && id !== COMPUTER)),
  ];
  const names = new Map<string, string>([[COMPUTER, "Computer"]]);
  if (wanted.length === 0) return names;
  const rows = await db
    .select({ id: players.id, email: players.email })
    .from(players)
    .where(inArray(players.id, wanted));
  for (const row of rows) names.set(row.id, displayName(row.email));
  for (const id of wanted) if (!names.has(id)) names.set(id, "Member");
  return names;
}
