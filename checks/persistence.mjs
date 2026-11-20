// Persistence: matches, moves, chat, ratings, queue and tournaments survive a restart.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { client } from "./lib.mjs";

const runtime = await startRuntime();
const call = client(runtime);

try {
  const m = await call("owner", "POST", "/api/matches", {
    game: "connect-four",
    opponent: "friend",
  });
  const joined = await call("member", "POST", `/api/matches/${m.json.id}/join`);
  const first = joined.json.turnUserId;
  await call(first, "POST", `/api/matches/${m.json.id}/moves`, { cell: 3 });
  await call("owner", "POST", `/api/matches/${m.json.id}/messages`, {
    body: "Nice opening",
  });
  const done = await call("owner", "POST", "/api/matches", {
    game: "tic-tac-toe",
    opponent: "friend",
  });
  await call("member", "POST", `/api/matches/${done.json.id}/join`);
  await call("member", "POST", `/api/matches/${done.json.id}/resign`);
  const t = await call("owner", "POST", "/api/tournaments", {
    name: "Durable cup",
    game: "five-in-a-row",
    mode: "leaderboard",
  });
  await call("member", "POST", `/api/tournaments/${t.json.id}/join`);
  await call("member", "POST", "/api/queue", { game: "five-in-a-row" });
  const ratingBefore = (await call("owner", "GET", "/api/rankings/tic-tac-toe"))
    .json.players;

  await runtime.restart();

  const after = (await call("member", "GET", `/api/matches/${m.json.id}`)).json;
  expect(after.status).toBe("active");
  expect(after.moves).toEqual([38]);
  expect(after.messages.map((x) => x.body)).toEqual(["Nice opening"]);
  const hist = (await call("member", "GET", "/api/history")).json.matches;
  expect(hist.find((x) => x.id === done.json.id)).toMatchObject({
    result: "loss",
    game: "tic-tac-toe",
  });
  expect(
    (await call("owner", "GET", "/api/rankings/tic-tac-toe")).json.players,
  ).toEqual(ratingBefore);
  expect(ratingBefore.find((p) => p.userId === "owner").rating).toBeGreaterThan(
    1200,
  );
  const tv = (await call("owner", "GET", `/api/tournaments/${t.json.id}`)).json;
  expect(tv.name).toBe("Durable cup");
  expect(tv.players.map((p) => p.id).sort()).toEqual(["member", "owner"]);
  expect((await call("member", "GET", "/api/queue")).json).toMatchObject({
    state: "waiting",
    game: "five-in-a-row",
  });
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
