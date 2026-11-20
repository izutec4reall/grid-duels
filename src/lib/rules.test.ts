import { describe, expect, it } from "vitest";
import {
  boardFrom,
  bracketPairs,
  computerMove,
  elo,
  legalCells,
  outcome,
  resolveMove,
  roundRobinRounds,
} from "./rules";

describe("tic-tac-toe", () => {
  it("finds a row win and a draw", () => {
    expect(outcome("tic-tac-toe", [0, 3, 1, 4, 2])).toEqual({
      winner: "first",
      line: [0, 1, 2],
    });
    expect(outcome("tic-tac-toe", [0, 1, 2, 4, 3, 5, 7, 6, 8]).winner).toBe(
      "draw",
    );
    expect(outcome("tic-tac-toe", [4, 0, 8]).winner).toBe(null);
  });
  it("refuses an occupied cell", () => {
    expect(resolveMove("tic-tac-toe", boardFrom("tic-tac-toe", [4]), 4)).toBe(
      null,
    );
  });
});

describe("connect four", () => {
  it("drops pieces to the lowest empty cell", () => {
    expect(resolveMove("connect-four", boardFrom("connect-four", []), 3)).toBe(
      38,
    );
    expect(
      resolveMove("connect-four", boardFrom("connect-four", [38]), 3),
    ).toBe(31);
    const full = [3, 10, 17, 24, 31, 38];
    expect(
      resolveMove("connect-four", boardFrom("connect-four", full), 3),
    ).toBe(null);
    expect(
      legalCells("connect-four", boardFrom("connect-four", full)),
    ).not.toContain(3);
  });
  it("wins on a diagonal", () => {
    // first: 35, 29, 23, 17 ; second fills under them.
    const moves = [35, 0, 29, 1, 23, 2, 17];
    expect(outcome("connect-four", moves).winner).toBe("first");
  });
});

describe("five in a row", () => {
  it("counts five or more", () => {
    expect(
      outcome("five-in-a-row", [0, 30, 1, 31, 2, 32, 3, 33, 4]).winner,
    ).toBe("first");
    // Six in a row: the gap filled last.
    expect(
      outcome("five-in-a-row", [0, 30, 1, 31, 2, 32, 4, 33, 5, 60, 3]).winner,
    ).toBe("first");
    expect(outcome("five-in-a-row", [0, 30, 1, 31, 2, 32, 3]).winner).toBe(
      null,
    );
  });
});

describe("computer", () => {
  it("takes an immediate win", () => {
    // Computer moves second (O) with 3,4 and X to play blocks elsewhere.
    expect(computerMove("tic-tac-toe", [0, 3, 1, 4, 8])).toBe(5);
  });
  it("blocks an immediate loss", () => {
    expect(computerMove("tic-tac-toe", [0, 4, 1])).toBe(2);
    expect(computerMove("connect-four", [38, 0, 31, 1, 24])).toBe(17);
  });
  it("always plays a legal move", () => {
    for (const game of [
      "tic-tac-toe",
      "connect-four",
      "five-in-a-row",
    ] as const) {
      const moves: number[] = [];
      while (outcome(game, moves).winner === null) {
        const cell = computerMove(game, moves);
        expect(legalCells(game, boardFrom(game, moves))).toContain(cell);
        moves.push(cell);
      }
    }
  });
});

describe("ratings and pairings", () => {
  it("moves ratings symmetrically", () => {
    const [a, b] = elo(1200, 1200, 1);
    expect(a).toBe(1216);
    expect(b).toBe(1184);
  });
  it("gives byes to top seeds", () => {
    expect(bracketPairs(["a", "b", "c"])).toEqual([
      ["a", null],
      ["b", "c"],
    ]);
    expect(
      bracketPairs(["a", "b", "c", "d", "e"]).filter(([, b]) => b === null)
        .length,
    ).toBe(3);
  });
  it("pairs everyone once in round robin", () => {
    const pairs = roundRobinRounds(["a", "b", "c", "d", "e"]).flat();
    expect(pairs.length).toBe(10);
    expect(new Set(pairs.map((p) => [...p].sort().join())).size).toBe(10);
  });
});
