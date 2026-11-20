// Authorization: perimeter, ownership, organizer/admin rules, no sign-in of its own.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { client, THIRD } from "./lib.mjs";

const runtime = await startRuntime();
const call = client(runtime);

try {
  const owners = await call("owner", "POST", "/api/matches", {
    game: "tic-tac-toe",
    opponent: "friend",
  });
  const t = await call("owner", "POST", "/api/tournaments", {
    name: "Owners cup",
    game: "tic-tac-toe",
    mode: "round-robin",
  });
  await runtime.assertPrivateAccess([
    "/",
    "/tournaments",
    "/rankings",
    "/history",
    `/play/${owners.json.id}`,
    `/tournaments/${t.json.id}`,
    "/api/history",
    "/api/queue",
    "/api/tournaments",
    "/api/rankings/connect-four",
    `/api/matches/${owners.json.id}`,
  ]);

  // Anonymous and outsider cannot act.
  for (const who of [undefined, "outsider"]) {
    const r1 = await call(who, "POST", "/api/matches", {
      game: "tic-tac-toe",
      opponent: "friend",
    });
    expect(r1.status, `${who} create`).toBeGreaterThanOrEqual(400);
    expect(r1.status).toBeLessThan(500);
    const r2 = await call(who, "POST", `/api/matches/${owners.json.id}/join`);
    expect(r2.status).toBeGreaterThanOrEqual(400);
    expect(r2.status).toBeLessThan(500);
    expect(r2.text).not.toContain(owners.json.id);
  }
  // The joinable match is still waiting after those attempts.
  expect(
    (await call("owner", "GET", `/api/matches/${owners.json.id}`)).json.status,
  ).toBe("waiting");

  // Only the creator cancels.
  expect(
    (await call("member", "DELETE", `/api/matches/${owners.json.id}`)).status,
  ).toBe(403);
  expect(
    (await call("owner", "GET", `/api/matches/${owners.json.id}`)).status,
  ).toBe(200);

  // Players only: a non-player cannot move, resign, chat or rematch.
  await call(THIRD, "POST", `/api/matches/${owners.json.id}/join`);
  for (const [method, path, body] of [
    ["POST", "moves", { cell: 4 }],
    ["POST", "resign"],
    ["POST", "messages", { body: "let me in" }],
    ["POST", "rematch"],
  ]) {
    const r = await call(
      "member",
      method,
      `/api/matches/${owners.json.id}/${path}`,
      body,
    );
    expect(r.status, path).toBe(403);
  }
  const still = (await call("owner", "GET", `/api/matches/${owners.json.id}`))
    .json;
  expect(still.status).toBe("active");
  expect(still.moves).toEqual([]);
  expect(still.messages).toEqual([]);

  // A computer match is its player's own.
  const bot = await call("owner", "POST", "/api/matches", {
    game: "five-in-a-row",
    opponent: "computer",
  });
  expect(
    (await call("member", "GET", `/api/matches/${bot.json.id}`)).status,
  ).toBe(404);
  expect(
    (
      await call("member", "POST", `/api/matches/${bot.json.id}/moves`, {
        cell: 112,
      })
    ).status,
  ).toBe(404);
  const botView = (await call("owner", "GET", `/api/matches/${bot.json.id}`))
    .json;
  expect(botView.status).toBe("active");

  // History is each member's own.
  await call("owner", "POST", `/api/matches/${bot.json.id}/resign`);
  expect(
    (await call("owner", "GET", "/api/history")).json.matches.map((m) => m.id),
  ).toContain(bot.json.id);
  expect(
    (await call("member", "GET", "/api/history")).json.matches.map((m) => m.id),
  ).not.toContain(bot.json.id);

  // Queue is per member: leaving removes only your own entry.
  await call("owner", "POST", "/api/queue", { game: "five-in-a-row" });
  await call("member", "DELETE", "/api/queue");
  expect((await call("owner", "GET", "/api/queue")).json.state).toBe("waiting");
  await call("owner", "DELETE", "/api/queue");

  // Tournament: only the organizer (or an admin) edits, starts, stops, deletes.
  const mt = await call("member", "POST", "/api/tournaments", {
    name: "Members only",
    game: "connect-four",
    mode: "leaderboard",
  });
  expect(
    (
      await call(THIRD, "PATCH", `/api/tournaments/${mt.json.id}`, {
        name: "Taken",
      })
    ).status,
  ).toBe(403);
  expect(
    (await call(THIRD, "POST", `/api/tournaments/${mt.json.id}/start`)).status,
  ).toBe(403);
  expect(
    (await call(THIRD, "POST", `/api/tournaments/${mt.json.id}/stop`)).status,
  ).toBe(403);
  expect(
    (await call(THIRD, "DELETE", `/api/tournaments/${mt.json.id}`)).status,
  ).toBe(403);
  expect(
    (await call("member", "DELETE", `/api/tournaments/${t.json.id}`)).status,
  ).toBe(403);
  expect(
    (await call("member", "GET", `/api/tournaments/${mt.json.id}`)).json.name,
  ).toBe("Members only");
  // The org owner is an admin.
  expect(
    (
      await call("owner", "PATCH", `/api/tournaments/${mt.json.id}`, {
        name: "Renamed by admin",
      })
    ).status,
  ).toBe(200);
  expect(
    (await call("owner", "DELETE", `/api/tournaments/${mt.json.id}`)).status,
  ).toBe(204);
  expect(
    (await call("member", "GET", `/api/tournaments/${mt.json.id}`)).status,
  ).toBe(404);

  // Nobody joins a started elimination or round robin.
  await call("member", "POST", `/api/tournaments/${t.json.id}/join`);
  await call("owner", "POST", `/api/tournaments/${t.json.id}/start`);
  expect(
    (await call(THIRD, "POST", `/api/tournaments/${t.json.id}/join`)).status,
  ).toBe(409);
  // A tournament match is playable only by its two players.
  const tv = (await call("owner", "GET", `/api/tournaments/${t.json.id}`)).json;
  expect(
    (await call(THIRD, "POST", `/api/matches/${tv.matches[0].id}/resign`))
      .status,
  ).toBe(403);

  // No sign-in of its own.
  for (const path of [
    "/login",
    "/signin",
    "/signup",
    "/logout",
    "/register",
    "/auth/login",
  ]) {
    const r = await call("member", "GET", path);
    expect(r.status, path).toBe(404);
    expect(r.text.toLowerCase()).not.toContain('type="password"');
  }
  const home = await call("member", "GET", "/");
  expect(home.text.toLowerCase()).not.toContain('type="password"');
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
