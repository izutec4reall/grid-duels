import { env } from "cloudflare:workers";
import { getEveryAppUser, isAdmin } from "@every-app/sdk/server";
import { ZodError } from "zod";
import { AppError, type Actor } from "./core";

/** The member the Gateway signed in, as the server code needs them. */
export function toActor(user: {
  id: string;
  email: string;
  orgRole: string;
}): Actor {
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}

/** Runs an API handler for the signed-in member and turns refusals into JSON errors. */
export async function api(
  request: Request,
  work: (actor: Actor, origin: string) => Promise<unknown>,
  okStatus = 200,
): Promise<Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  try {
    const body = await work(toActor(user), new URL(request.url).origin);
    if (body === undefined) return new Response(null, { status: 204 });
    return Response.json(body, { status: okStatus });
  } catch (error) {
    if (error instanceof AppError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) {
      return Response.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "Send a JSON body");
  }
}
