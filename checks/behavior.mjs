// Behavior: every frozen feature's main path, request-level and in the browser.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { client, playOut, startFriendMatch, THIRD } from "./lib.mjs";

const runtime = await startRuntime();
const call = client(runtime);
const ids = { owner: "owner", member: "member", third: THIRD.sub };

try {
  // ---- F001 + F002: friend match by link, server-validated moves, win.
  const created = await call("owner", "POST", "/api/matches", {
    game: "tic-tac-toe",
    opponent: "friend",
  });
  expect(created.status, created.text).toBe(201);
  expect(created.json.status).toBe("waiting");
  const link = new URL(created.json.url);
  expect(link.hostname).toBe(runtime.hostname);
  expect(link.pathname).toBe(`/play/${created.json.id}`);
  expect(
    (await call("owner", "POST", `/api/matches/${created.json.id}/join`))
      .status,
  ).toBe(409);
  const seen = await call("member", "GET", `/api/matches/${created.json.id}`);
  expect(seen.json.canJoin).toBe(true);
  const joined = await call(
    "member",
    "POST",
    `/api/matches/${created.json.id}/join`,
  );
  expect(joined.status).toBe(200);
  expect(joined.json.status).toBe("active");
  expect(["owner", "member"]).toContain(joined.json.turnUserId);
  const first = joined.json.turnUserId;
  const second = first === "owner" ? "member" : "owner";
  const id1 = created.json.id;
  // Wrong turn, occupied cell, out of range.
  expect(
    (await call(second, "POST", `/api/matches/${id1}/moves`, { cell: 0 }))
      .status,
  ).toBe(409);
  expect(
    (await call(first, "POST", `/api/matches/${id1}/moves`, { cell: 0 }))
      .status,
  ).toBe(200);
  expect(
    (await call(second, "POST", `/api/matches/${id1}/moves`, { cell: 0 }))
      .status,
  ).toBe(409);
  expect(
    (await call(second, "POST", `/api/matches/${id1}/moves`, { cell: 9 }))
      .status,
  ).toBe(400);
  // A third member watches but cannot move or join.
  const spect = await call(THIRD, "GET", `/api/matches/${id1}`);
  expect(spect.status).toBe(200);
  expect(spect.json.mySeat).toBe(null);
  expect(spect.json.canJoin).toBe(false);
  expect(
    (await call(THIRD, "POST", `/api/matches/${id1}/moves`, { cell: 5 }))
      .status,
  ).toBe(403);
  expect((await call(THIRD, "POST", `/api/matches/${id1}/join`)).status).toBe(
    409,
  );
  const won = await playOut(call, id1, { f: first, s: second }, [
    ["s", 3],
    ["f", 1],
    ["s", 4],
    ["f", 2],
  ]);
  expect(won.status).toBe("finished");
  expect(won.result).toBe("win");
  expect(won.winnerId).toBe(first);
  expect(won.winLine).toEqual([0, 1, 2]);
  expect(won.moves).toEqual([0, 3, 1, 4, 2]);
  expect(won.finishedAt).toBeTruthy();
  expect(
    (await call(second, "POST", `/api/matches/${id1}/moves`, { cell: 8 }))
      .status,
  ).toBe(409);

  // Rematch: both accept, a new match starts with the first move swapped.
  const offer = await call(second, "POST", `/api/matches/${id1}/rematch`);
  expect(offer.status).toBe(200);
  expect(offer.json.rematchMatchId).toBe(null);
  const accept = await call(first, "POST", `/api/matches/${id1}/rematch`);
  expect(accept.json.rematchMatchId).toBeTruthy();
  const re = await call(
    "owner",
    "GET",
    `/api/matches/${accept.json.rematchMatchId}`,
  );
  expect(re.json.status).toBe("active");
  expect(re.json.turnUserId).toBe(second);

  // Draw on a full board (rematch: `second` moves first now).
  const drawn = await playOut(call, re.json.id, { x: second, o: first }, [
    ["x", 0],
    ["o", 1],
    ["x", 2],
    ["o", 4],
    ["x", 3],
    ["o", 5],
    ["x", 7],
    ["o", 6],
    ["x", 8],
  ]);
  expect(drawn.status).toBe("finished");
  expect(drawn.result).toBe("draw");
  expect(drawn.winnerId).toBe(null);

  // Connect four: pieces fall, four in a column wins.
  const c4 = await startFriendMatch(call, "owner", "member", "connect-four", {
    creator: "owner",
    joiner: "member",
  });
  const who = { creator: "owner", joiner: "member" };
  const c4First = who[c4.first];
  const c4Second = who[c4.second];
  const firstDrop = await call(c4First, "POST", `/api/matches/${c4.id}/moves`, {
    cell: 0,
  });
  expect(firstDrop.json.moves).toEqual([35]);
  const c4Done = await playOut(call, c4.id, { f: c4First, s: c4Second }, [
    ["s", 1],
    ["f", 0],
    ["s", 1],
    ["f", 0],
    ["s", 1],
    ["f", 0],
  ]);
  expect(c4Done.result).toBe("win");
  expect(c4Done.winnerId).toBe(c4First);
  expect(c4Done.winLine.sort((a, b) => a - b)).toEqual([14, 21, 28, 35]);

  // Five in a row on 15x15.
  const g = await startFriendMatch(call, "owner", "member", "five-in-a-row", {
    creator: "owner",
    joiner: "member",
  });
  const gF = who[g.first];
  const gS = who[g.second];
  const gDone = await playOut(call, g.id, { f: gF, s: gS }, [
    ["f", 0],
    ["s", 30],
    ["f", 1],
    ["s", 31],
    ["f", 2],
    ["s", 32],
    ["f", 3],
    ["s", 33],
    ["f", 224],
  ]);
  expect(gDone.status).toBe("active");
  expect(
    (await call(gS, "POST", `/api/matches/${g.id}/moves`, { cell: 225 }))
      .status,
  ).toBe(400);
  const gWin = await call(gS, "POST", `/api/matches/${g.id}/moves`, {
    cell: 34,
  });
  expect(gWin.json.result).toBe("win");
  expect(gWin.json.winnerId).toBe(gS);
  expect(
    (await call(gF, "POST", `/api/matches/${g.id}/moves`, { cell: 100 }))
      .status,
  ).toBe(409);

  // Resign gives the opponent the win.
  const r = await startFriendMatch(call, "owner", "member", "tic-tac-toe", {
    creator: "owner",
    joiner: "member",
  });
  const resigned = await call("member", "POST", `/api/matches/${r.id}/resign`);
  expect(resigned.json.status).toBe("finished");
  expect(resigned.json.result).toBe("resign");
  expect(resigned.json.winnerId).toBe("owner");

  // Creator cancels a match nobody joined.
  const lonely = await call("owner", "POST", "/api/matches", {
    game: "connect-four",
    opponent: "friend",
  });
  expect(
    (await call("owner", "DELETE", `/api/matches/${lonely.json.id}`)).status,
  ).toBe(204);
  expect(
    (await call("owner", "GET", `/api/matches/${lonely.json.id}`)).status,
  ).toBe(404);
  expect((await call("owner", "DELETE", `/api/matches/${r.id}`)).status).toBe(
    409,
  );

  // ---- F005: chat and reactions.
  const chatMatch = await startFriendMatch(
    call,
    "owner",
    "member",
    "tic-tac-toe",
    { creator: "owner", joiner: "member" },
  );
  expect(
    (
      await call("owner", "POST", `/api/matches/${chatMatch.id}/messages`, {
        body: "Good luck!",
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await call("member", "POST", `/api/matches/${chatMatch.id}/messages`, {
        emoji: "thumbs-up",
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await call("member", "POST", `/api/matches/${chatMatch.id}/messages`, {
        emoji: "unicorn",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("member", "POST", `/api/matches/${chatMatch.id}/messages`, {
        body: "x".repeat(201),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(THIRD, "POST", `/api/matches/${chatMatch.id}/messages`, {
        body: "hi",
      })
    ).status,
  ).toBe(403);
  const chatView = await call(THIRD, "GET", `/api/matches/${chatMatch.id}`);
  expect(chatView.json.messages.map((m) => m.body)).toEqual([
    "Good luck!",
    "thumbs-up",
  ]);
  expect(chatView.json.messages[1].kind).toBe("emoji");
  expect(chatView.json.canChat).toBe(false);

  // ---- F003: matchmaking queue.
  const q1 = await call("owner", "POST", "/api/queue", { game: "tic-tac-toe" });
  expect(q1.json.state).toBe("waiting");
  const q1b = await call("owner", "POST", "/api/queue", {
    game: "connect-four",
  });
  expect(q1b.json).toMatchObject({ state: "waiting", game: "connect-four" });
  expect((await call("owner", "GET", "/api/queue")).json).toMatchObject({
    state: "waiting",
    game: "connect-four",
  });
  const q2 = await call("member", "POST", "/api/queue", {
    game: "tic-tac-toe",
  });
  expect(q2.json.state).toBe("waiting");
  expect((await call("member", "DELETE", "/api/queue")).status).toBe(200);
  expect((await call("member", "GET", "/api/queue")).json.state).toBe("idle");
  const q3 = await call("member", "POST", "/api/queue", {
    game: "connect-four",
  });
  expect(q3.json.state).toBe("matched");
  const ownerSees = await call("owner", "GET", "/api/queue");
  expect(ownerSees.json).toMatchObject({
    state: "matched",
    matchId: q3.json.matchId,
  });
  const paired = await call("owner", "GET", `/api/matches/${q3.json.matchId}`);
  expect(paired.json.status).toBe("active");
  expect(paired.json.game).toBe("connect-four");
  expect([paired.json.players.a.id, paired.json.players.b.id].sort()).toEqual([
    "member",
    "owner",
  ]);

  // ---- F004: computer opponent replies with legal moves; no rating change.
  const before = (await call("owner", "GET", "/api/rankings/connect-four"))
    .json;
  const bot = await call("owner", "POST", "/api/matches", {
    game: "connect-four",
    opponent: "computer",
  });
  expect(bot.status).toBe(201);
  expect(bot.json.status).toBe("active");
  expect(bot.json.players.b.id).toBe("computer");
  let state = bot.json;
  for (let i = 0; i < 30 && state.status === "active"; i++) {
    expect(state.turnUserId).toBe("owner");
    const n = state.moves.length;
    const col = [0, 6, 0, 6, 1, 5, 1, 5, 2, 4, 2, 4, 3, 3, 3, 0, 6, 1, 5, 2, 4][
      i % 21
    ];
    const res = await call(
      "owner",
      "POST",
      `/api/matches/${bot.json.id}/moves`,
      { cell: col },
    );
    if (res.status === 409) {
      // Column full: pick any open one.
      const open = [0, 1, 2, 3, 4, 5, 6].find((c) => !state.moves.includes(c));
      const r2 = await call(
        "owner",
        "POST",
        `/api/matches/${bot.json.id}/moves`,
        { cell: open },
      );
      expect(r2.status).toBe(200);
      state = r2.json;
    } else {
      expect(res.status, res.text).toBe(200);
      state = res.json;
    }
    if (state.status === "active") expect(state.moves.length).toBe(n + 2);
  }
  expect(state.status).toBe("finished");
  expect(new Set(state.moves).size).toBe(state.moves.length);
  const after = (await call("owner", "GET", "/api/rankings/connect-four")).json;
  expect(after).toEqual(before);
  const history = await call("owner", "GET", "/api/history");
  expect(
    history.json.matches.some(
      (m) => m.id === bot.json.id && m.opponent === "Computer",
    ),
  ).toBe(true);

  // ---- F007: ratings and history.
  const ttt = (await call("member", "GET", "/api/rankings/tic-tac-toe")).json
    .players;
  const o = ttt.find((p) => p.userId === "owner");
  const m = ttt.find((p) => p.userId === "member");
  // Finished so far between them: id1 (first wins), its rematch (draw), r (owner wins).
  expect(o).toMatchObject({
    wins: first === "owner" ? 2 : 1,
    losses: first === "owner" ? 0 : 1,
    draws: 1,
  });
  expect(m).toMatchObject({
    wins: first === "member" ? 1 : 0,
    losses: first === "member" ? 1 : 2,
    draws: 1,
  });
  expect(Math.abs(o.rating + m.rating - 2400)).toBeLessThanOrEqual(2);
  if (first === "owner") expect(o.rating).toBeGreaterThan(1220);
  expect(ttt.findIndex((p) => p.userId === "owner")).toBe(
    o.rating >= m.rating ? 0 : 1,
  );
  const mh = await call("member", "GET", "/api/history");
  const row1 = mh.json.matches.find((m) => m.id === id1);
  expect(row1).toMatchObject({
    game: "tic-tac-toe",
    result: second === "member" ? "loss" : "win",
  });
  expect(row1.opponent).toBe("owner");
  const resignRow = mh.json.matches.find((m) => m.id === r.id);
  expect(resignRow.result).toBe("loss");
  expect(mh.json.matches.some((m) => m.id === bot.json.id)).toBe(false);

  // ---- F006: tournaments.
  // Round robin: everyone plays everyone once.
  const rr = await call("owner", "POST", "/api/tournaments", {
    name: "Lunch league",
    game: "tic-tac-toe",
    mode: "round-robin",
  });
  expect(rr.status, rr.text).toBe(201);
  expect(new URL(rr.json.url).pathname).toBe(`/tournaments/${rr.json.id}`);
  for (const who2 of ["member", THIRD])
    expect(
      (await call(who2, "POST", `/api/tournaments/${rr.json.id}/join`)).status,
    ).toBe(200);
  expect(
    (await call("member", "POST", `/api/tournaments/${rr.json.id}/start`))
      .status,
  ).toBe(403);
  const rrStarted = await call(
    "owner",
    "POST",
    `/api/tournaments/${rr.json.id}/start`,
  );
  expect(rrStarted.json.status).toBe("running");
  expect(rrStarted.json.matches.length).toBe(3);
  expect(
    (await call(THIRD, "POST", `/api/tournaments/${rr.json.id}/leave`)).status,
  ).toBe(409);
  const lateRR = await call(
    { sub: "late", email: "late@example.test", orgRole: "member" },
    "POST",
    `/api/tournaments/${rr.json.id}/join`,
  );
  expect(lateRR.status).toBe(409);
  const nameOf = { owner: "owner", member: "member", [THIRD.sub]: THIRD };
  for (const m of rrStarted.json.matches) {
    const view = (await call("owner", "GET", `/api/matches/${m.id}`)).json;
    const f = nameOf[view.turnUserId];
    const s =
      nameOf[
        view.players.a.id === view.turnUserId
          ? view.players.b.id
          : view.players.a.id
      ];
    const ownerIn = [view.players.a.id, view.players.b.id].includes("owner");
    // Owner wins both of theirs; the remaining game is a draw.
    if (ownerIn) {
      const loser = view.turnUserId === "owner" ? s : f;
      expect(
        (await call(loser, "POST", `/api/matches/${m.id}/resign`)).status,
      ).toBe(200);
    } else {
      await playOut(call, m.id, { x: f, o: s }, [
        ["x", 0],
        ["o", 1],
        ["x", 2],
        ["o", 4],
        ["x", 3],
        ["o", 5],
        ["x", 7],
        ["o", 6],
        ["x", 8],
      ]);
    }
  }
  const rrDone = (await call("member", "GET", `/api/tournaments/${rr.json.id}`))
    .json;
  expect(rrDone.status).toBe("finished");
  expect(rrDone.winner.id).toBe("owner");
  expect(rrDone.standings[0]).toMatchObject({
    userId: "owner",
    points: 30,
    wins: 2,
  });
  expect(rrDone.standings[1].points).toBe(5);

  // Single elimination with three players: one bye, a drawn game is replayed.
  const se = await call("member", "POST", "/api/tournaments", {
    name: "Knockout night",
    game: "tic-tac-toe",
    mode: "single-elimination",
  });
  for (const who2 of ["owner", THIRD])
    expect(
      (await call(who2, "POST", `/api/tournaments/${se.json.id}/join`)).status,
    ).toBe(200);
  const seStarted = (
    await call("member", "POST", `/api/tournaments/${se.json.id}/start`)
  ).json;
  expect(seStarted.status).toBe("running");
  const r1 = seStarted.matches.filter((m) => m.round === 1);
  expect(r1.filter((m) => m.bye).length).toBe(1);
  const real = r1.find((m) => !m.bye);
  expect(real.status).toBe("active");
  const realView = (await call("owner", "GET", `/api/matches/${real.id}`)).json;
  const rf = nameOf[realView.turnUserId];
  const rs =
    nameOf[
      realView.players.a.id === realView.turnUserId
        ? realView.players.b.id
        : realView.players.a.id
    ];
  await playOut(call, real.id, { x: rf, o: rs }, [
    ["x", 0],
    ["o", 1],
    ["x", 2],
    ["o", 4],
    ["x", 3],
    ["o", 5],
    ["x", 7],
    ["o", 6],
    ["x", 8],
  ]);
  const afterDraw = (
    await call("member", "GET", `/api/tournaments/${se.json.id}`)
  ).json;
  const replay = afterDraw.matches.filter(
    (m) => m.round === 1 && !m.bye && m.status === "active",
  );
  expect(replay.length).toBe(1);
  expect(replay[0].id).not.toBe(real.id);
  const replayView = (
    await call("owner", "GET", `/api/matches/${replay[0].id}`)
  ).json;
  const loser1 =
    replayView.players.a.id === "owner" || replayView.players.b.id === "owner"
      ? nameOf[
          [replayView.players.a.id, replayView.players.b.id].find(
            (x) => x !== "owner",
          )
        ]
      : nameOf[replayView.players.a.id];
  expect(
    (await call(loser1, "POST", `/api/matches/${replay[0].id}/resign`)).status,
  ).toBe(200);
  const r2 = (await call("member", "GET", `/api/tournaments/${se.json.id}`))
    .json;
  const final = r2.matches.find((m) => m.round === 2);
  expect(final.status).toBe("active");
  const finalView = (await call("owner", "GET", `/api/matches/${final.id}`))
    .json;
  const finalists = [finalView.players.a.id, finalView.players.b.id];
  const champion = finalists[0];
  expect(
    (
      await call(
        nameOf[finalists[1]],
        "POST",
        `/api/matches/${final.id}/resign`,
      )
    ).status,
  ).toBe(200);
  const seDone = (await call("member", "GET", `/api/tournaments/${se.json.id}`))
    .json;
  expect(seDone.status).toBe("finished");
  expect(seDone.winner.id).toBe(champion);
  expect(
    seDone.standings.find((s) => s.userId === finalists[1]).eliminated,
  ).toBe(true);

  // Leaderboard: automatic pairing, 15 per win, late joining, organizer stops.
  const lb = await call("owner", "POST", "/api/tournaments", {
    name: "Five in a row sprint",
    game: "five-in-a-row",
    mode: "leaderboard",
  });
  expect(
    (
      await call("member", "PATCH", `/api/tournaments/${lb.json.id}`, {
        name: "Mine now",
      })
    ).status,
  ).toBe(403);
  const renamed = await call(
    "owner",
    "PATCH",
    `/api/tournaments/${lb.json.id}`,
    { name: "Friday sprint" },
  );
  expect(renamed.json.name).toBe("Friday sprint");
  await call("member", "POST", `/api/tournaments/${lb.json.id}/join`);
  const lbStarted = (
    await call("owner", "POST", `/api/tournaments/${lb.json.id}/start`)
  ).json;
  const live = lbStarted.matches.filter((m) => m.status === "active");
  expect(live.length).toBe(1);
  const lv = (await call("owner", "GET", `/api/matches/${live[0].id}`)).json;
  expect(lv.tournament.id).toBe(lb.json.id);
  expect(
    (await call("member", "POST", `/api/matches/${live[0].id}/resign`)).status,
  ).toBe(200);
  const lb2 = (await call("member", "GET", `/api/tournaments/${lb.json.id}`))
    .json;
  expect(lb2.standings[0]).toMatchObject({ userId: "owner", points: 15 });
  expect(lb2.matches.filter((m) => m.status === "active").length).toBe(1);
  expect(
    (await call(THIRD, "POST", `/api/tournaments/${lb.json.id}/join`)).status,
  ).toBe(200);
  expect(
    (await call("member", "POST", `/api/tournaments/${lb.json.id}/stop`))
      .status,
  ).toBe(403);
  const stopped = (
    await call("owner", "POST", `/api/tournaments/${lb.json.id}/stop`)
  ).json;
  expect(stopped.status).toBe("finished");
  expect(stopped.winner.id).toBe("owner");
  const lists = (await call(THIRD, "GET", "/api/tournaments")).json;
  expect(lists.mine.map((t) => t.id)).toEqual(
    expect.arrayContaining([lb.json.id, se.json.id, rr.json.id]),
  );
  const openT = await call("member", "POST", "/api/tournaments", {
    name: "Open table",
    game: "connect-four",
    mode: "round-robin",
  });
  expect(
    (await call(THIRD, "GET", "/api/tournaments")).json.open.map((t) => t.id),
  ).toContain(openT.json.id);
  expect(
    (await call("member", "DELETE", `/api/tournaments/${openT.json.id}`))
      .status,
  ).toBe(204);
  expect(
    (await call("member", "GET", `/api/tournaments/${openT.json.id}`)).status,
  ).toBe(404);

  // ---- Browser journey: two members play connect four through a link and chat.
  const ownerCtx = await runtime.context("owner");
  const memberCtx = await runtime.context("member");
  const op = await ownerCtx.newPage();
  const mp = await memberCtx.newPage();
  await op.goto("/");
  await runtime.assertBackLink(op);
  await op.getByTestId("game-connect-four").click();
  await Promise.all([
    op.waitForURL(/\/play\//),
    op.getByTestId("invite-friend").click(),
  ]);
  const shareUrl = await op.getByTestId("share-link").inputValue();
  expect(new URL(shareUrl).hostname).toBe(runtime.hostname);
  await mp.goto(new URL(shareUrl).pathname);
  await mp.getByTestId("join-match").click();
  await expect(mp.getByTestId("turn")).toBeVisible();
  await expect(op.getByTestId("turn")).toBeVisible();
  await op.getByTestId("chat-input").fill("Good luck, best of three?");
  await op.getByTestId("chat-send").click();
  await expect(mp.getByTestId("chat-log")).toContainText(
    "Good luck, best of three?",
  );
  await mp.getByTestId("chat-input").fill("You're on. Center column is mine");
  await mp.getByTestId("chat-send").click();
  await mp.getByTestId("reaction-fire").click();
  await expect(op.getByTestId("chat-log")).toContainText(
    "Center column is mine",
  );
  const pages = { owner: op, member: mp };
  // The first mover stacks column 3; the other answers in 2 and 4.
  const firstRole =
    (await op.getByTestId("board").getAttribute("data-my-turn")) === "true"
      ? "owner"
      : "member";
  const secondRole = firstRole === "owner" ? "member" : "owner";
  const seq = [
    [firstRole, 3],
    [secondRole, 2],
    [firstRole, 3],
    [secondRole, 4],
    [firstRole, 3],
    [secondRole, 2],
    [firstRole, 3],
  ];
  let count = 0;
  for (const [role, col] of seq) {
    const page = pages[role];
    await expect(page.getByTestId("board")).toHaveAttribute(
      "data-my-turn",
      "true",
    );
    await page.getByTestId(`cell-${col}`).click();
    count++;
    await expect(op.getByTestId("board")).toHaveAttribute(
      "data-moves",
      String(count),
    );
    await expect(mp.getByTestId("board")).toHaveAttribute(
      "data-moves",
      String(count),
    );
  }
  await expect(pages[firstRole].getByTestId("result")).toContainText("You won");
  await expect(pages[secondRole].getByTestId("result")).toContainText(
    "You lost",
  );
  await expect(op.getByTestId("chat-log")).toContainText("Fire");

  // History and rankings show the result.
  await mp.goto("/history");
  await expect(mp.getByTestId("history-table")).toContainText("Connect four");
  await mp.goto("/rankings");
  await expect(mp.getByTestId("rankings-table")).toContainText("owner");

  // A tournament made in the browser, joined from its link.
  await op.goto("/tournaments");
  await op.getByTestId("new-tournament").click();
  await op
    .getByLabel("Name", { exact: true })
    .fill("Thursday Connect Four Cup");
  await op.getByTestId("mode-round-robin").click();
  await op.getByTestId("tgame-connect-four").click();
  await Promise.all([
    op.waitForURL(/\/tournaments\/[^/]+$/),
    op.getByTestId("create-tournament").click(),
  ]);
  const tUrl = new URL(op.url()).pathname;
  await mp.goto(tUrl);
  await mp.getByTestId("join-tournament").click();
  await expect(op.getByTestId("players")).toContainText("member", {
    timeout: 10000,
  });
  await op.getByTestId("start-tournament").click();
  await expect(mp.getByTestId("tournament-matches")).toContainText("Round 1");

  // Back to the finished game for the public picture.
  await pages[firstRole].goto(new URL(shareUrl).pathname);
  await expect(pages[firstRole].getByTestId("result")).toContainText("You won");
  await expect(pages[firstRole].getByTestId("chat-log")).toContainText("Fire");
  await runtime.screenshot(pages[firstRole]);

  // ---- Phone-sized smoke.
  const phone = await runtime.context("member", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const pp = await phone.newPage();
  await pp.goto("/");
  await expect(pp.getByTestId("invite-friend")).toBeVisible();
  await pp.goto(new URL(shareUrl).pathname);
  await expect(pp.getByTestId("board")).toBeVisible();
  const box = await pp.getByTestId("board").boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
