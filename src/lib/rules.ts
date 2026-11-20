// The three games' rules. Pure functions, shared by the server and the board.

export const GAMES = ["tic-tac-toe", "connect-four", "five-in-a-row"] as const;
export type Game = (typeof GAMES)[number];

interface GameSpec {
  label: string;
  cols: number;
  rows: number;
  /** Stones in a line that win. */
  line: number;
  /** Pieces fall to the lowest empty cell of the column. */
  gravity: boolean;
}

export const SPECS: Record<Game, GameSpec> = {
  "tic-tac-toe": {
    label: "Tic-tac-toe",
    cols: 3,
    rows: 3,
    line: 3,
    gravity: false,
  },
  "connect-four": {
    label: "Connect four",
    cols: 7,
    rows: 6,
    line: 4,
    gravity: true,
  },
  "five-in-a-row": {
    label: "Five in a row",
    cols: 15,
    rows: 15,
    line: 5,
    gravity: false,
  },
};

/** 0 empty, 1 first mover, 2 second mover. */
export type Board = number[];

export function boardFrom(game: Game, moves: number[]): Board {
  const { cols, rows } = SPECS[game];
  const board = new Array<number>(cols * rows).fill(0);
  moves.forEach((cell, i) => {
    board[cell] = i % 2 === 0 ? 1 : 2;
  });
  return board;
}

/**
 * Where a click on `cell` places a piece, or null when it can't. Connect four
 * takes the column of any cell and drops to its lowest empty one.
 */
export function resolveMove(
  game: Game,
  board: Board,
  cell: number,
): number | null {
  const { cols, rows, gravity } = SPECS[game];
  if (!Number.isInteger(cell) || cell < 0 || cell >= cols * rows) return null;
  if (!gravity) return board[cell] === 0 ? cell : null;
  const col = cell % cols;
  for (let row = rows - 1; row >= 0; row--) {
    const at = row * cols + col;
    if (board[at] === 0) return at;
  }
  return null;
}

export function inRange(game: Game, cell: number): boolean {
  const { cols, rows } = SPECS[game];
  return Number.isInteger(cell) && cell >= 0 && cell < cols * rows;
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

/** The longest line through `cell` for the piece on it, as cell indexes. */
function lineThrough(
  game: Game,
  board: Board,
  cell: number,
  piece: number,
): number[] {
  const { cols, rows } = SPECS[game];
  const r0 = Math.floor(cell / cols);
  const c0 = cell % cols;
  let best: number[] = [cell];
  for (const [dr, dc] of DIRECTIONS) {
    const run = [cell];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (
        r >= 0 &&
        r < rows &&
        c >= 0 &&
        c < cols &&
        board[r * cols + c] === piece
      ) {
        run.push(r * cols + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (run.length > best.length) best = run;
  }
  return best;
}

export interface Outcome {
  /** "first" | "second" when someone has a line, "draw" on a full board. */
  winner: "first" | "second" | "draw" | null;
  line: number[];
}

/** The outcome after the moves so far (only the last move can have ended it). */
export function outcome(game: Game, moves: number[]): Outcome {
  if (moves.length === 0) return { winner: null, line: [] };
  const board = boardFrom(game, moves);
  const last = moves[moves.length - 1]!;
  const piece = board[last]!;
  const line = lineThrough(game, board, last, piece);
  if (line.length >= SPECS[game].line) {
    return {
      winner: piece === 1 ? "first" : "second",
      line: line.sort((a, b) => a - b),
    };
  }
  if (moves.length === board.length) return { winner: "draw", line: [] };
  return { winner: null, line: [] };
}

/** Every cell the next piece may land on. */
export function legalCells(game: Game, board: Board): number[] {
  const { cols, gravity } = SPECS[game];
  if (gravity) {
    const out: number[] = [];
    for (let c = 0; c < cols; c++) {
      const at = resolveMove(game, board, c);
      if (at !== null) out.push(at);
    }
    return out;
  }
  return board.flatMap((v, i) => (v === 0 ? [i] : []));
}

/**
 * The computer's move: a win when one exists, else a block of the opponent's
 * win, else the cell that builds the longest lines for both sides.
 */
export function computerMove(game: Game, moves: number[]): number {
  const board = boardFrom(game, moves);
  const me = moves.length % 2 === 0 ? 1 : 2;
  const them = me === 1 ? 2 : 1;
  const { cols, rows, line } = SPECS[game];
  let candidates = legalCells(game, board);
  if (game === "five-in-a-row" && moves.length > 0) {
    // Only cells near existing stones are worth looking at.
    candidates = candidates.filter((cell) =>
      moves.some((m) => {
        const dr = Math.abs(Math.floor(m / cols) - Math.floor(cell / cols));
        const dc = Math.abs((m % cols) - (cell % cols));
        return dr <= 2 && dc <= 2;
      }),
    );
  }
  const reach = (cell: number, piece: number) => {
    board[cell] = piece;
    const n = lineThrough(game, board, cell, piece).length;
    board[cell] = 0;
    return n;
  };
  const win = candidates.find((cell) => reach(cell, me) >= line);
  if (win !== undefined) return win;
  const block = candidates.find((cell) => reach(cell, them) >= line);
  if (block !== undefined) return block;
  const centerR = (rows - 1) / 2;
  const centerC = (cols - 1) / 2;
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const cell of candidates) {
    const own = reach(cell, me);
    const other = reach(cell, them);
    const dist =
      Math.abs(Math.floor(cell / cols) - centerR) +
      Math.abs((cell % cols) - centerC);
    let score = own * own * 2 + other * other - dist * 0.1;
    if (SPECS[game].gravity) {
      // Don't hand the opponent a win on the cell just above.
      const above = cell - cols;
      if (above >= 0) {
        board[cell] = me;
        if (reach(above, them) >= line) score -= 100;
        board[cell] = 0;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

/** The new ratings after a game; `score` is 1 for an A win, 0.5 draw, 0 loss. */
export function elo(
  a: number,
  b: number,
  score: number,
  k = 32,
): [number, number] {
  const expected = 1 / (1 + 10 ** ((b - a) / 400));
  const delta = k * (score - expected);
  return [a + delta, b - delta];
}

/** Points in leaderboard tournaments and standings. */
export const POINTS = { win: 15, draw: 5, loss: 0 } as const;

/**
 * First-round pairs of a single-elimination bracket for players in seed order.
 * The bracket is the next power of two; the top seeds get the byes (null).
 */
export function bracketPairs<T>(seeded: T[]): [T, T | null][] {
  let size = 1;
  while (size < seeded.length) size *= 2;
  const pairs: [T, T | null][] = [];
  for (let i = 0; i < size / 2; i++) {
    pairs.push([seeded[i]!, seeded[size - 1 - i] ?? null]);
  }
  return pairs;
}

/** Round-robin pairs by the circle method: everyone meets everyone once. */
export function roundRobinRounds<T>(players: T[]): [T, T][][] {
  const list: (T | null)[] = [...players];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a != null && b != null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}
