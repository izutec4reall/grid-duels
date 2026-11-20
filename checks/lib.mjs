// Shared helpers for the release checks.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

export const THIRD = {
  sub: "third-member",
  email: "rosa@example.test",
  orgRole: "member",
};

/** A JSON call as a role ("owner", "member", "outsider", undefined) or as a minted member identity. */
export function client(runtime) {
  return async function call(who, method, path, body) {
    const init = {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    let response;
    if (who && typeof who === "object") {
      const token = await runtime.token({ subject: who });
      response = await runtime.mf.dispatchFetch(
        `http://${runtime.hostname}${path}`,
        {
          ...init,
          redirect: "manual",
          headers: { ...init.headers, "x-everyapp-identity": token },
        },
      );
    } else {
      response = await runtime.fetch(path, { role: who, ...init });
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  };
}

/** Plays `cells` alternately starting with whoever's turn it is; returns the last state. */
export async function playOut(call, matchId, byUser, plan) {
  let state;
  for (const [who, cell] of plan) {
    const res = await call(
      byUser[who],
      "POST",
      `/api/matches/${matchId}/moves`,
      { cell },
    );
    expect(res.status, `${who} plays ${cell}: ${res.text}`).toBe(200);
    state = res.json;
  }
  return state;
}

/** Creates a friend match as `creator`, has `joiner` join it, and returns { id, first, second } role keys. */
export async function startFriendMatch(call, creator, joiner, game, ids) {
  const created = await call(creator, "POST", "/api/matches", {
    game,
    opponent: "friend",
  });
  expect(created.status, created.text).toBe(201);
  const joined = await call(
    joiner,
    "POST",
    `/api/matches/${created.json.id}/join`,
  );
  expect(joined.status, joined.text).toBe(200);
  expect(joined.json.status).toBe("active");
  const firstId = joined.json.turnUserId;
  const first = firstId === ids.creator ? "creator" : "joiner";
  return {
    id: created.json.id,
    state: joined.json,
    first,
    second: first === "creator" ? "joiner" : "creator",
  };
}
