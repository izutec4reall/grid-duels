import { cn } from "cn";
import { Circle, X } from "lucide-react";
import { boardFrom, SPECS, type Game } from "@/lib/rules";

/** The piece of the first (1) or second (2) mover. */
export function Piece({
  game,
  piece,
  className,
}: {
  game: Game;
  piece: 1 | 2;
  className?: string;
}) {
  if (game === "tic-tac-toe") {
    return piece === 1 ? (
      <X
        className={cn("size-3/4 text-primary", className)}
        strokeWidth={2.5}
        aria-label="X"
      />
    ) : (
      <Circle
        className={cn("size-2/3 text-warning", className)}
        strokeWidth={2.5}
        aria-label="O"
      />
    );
  }
  if (game === "connect-four") {
    return (
      <span
        className={cn(
          "block size-4/5 rounded-full",
          piece === 1 ? "bg-primary" : "bg-warning",
          className,
        )}
        aria-label={piece === 1 ? "first" : "second"}
      />
    );
  }
  return (
    <span
      className={cn(
        "block size-4/5 rounded-full border",
        piece === 1
          ? "border-foreground bg-foreground"
          : "border-foreground/60 bg-background",
        className,
      )}
      aria-label={piece === 1 ? "black" : "white"}
    />
  );
}

export function Board({
  game,
  moves,
  winLine = [],
  canMove,
  onPlay,
}: {
  game: Game;
  moves: number[];
  winLine?: number[];
  canMove: boolean;
  onPlay?: (cell: number) => void;
}) {
  const { cols } = SPECS[game];
  const board = boardFrom(game, moves);
  const last = moves[moves.length - 1];
  const wide = game === "five-in-a-row";
  return (
    <div
      data-testid="board"
      data-my-turn={canMove ? "true" : "false"}
      data-moves={moves.length}
      className={cn(
        "mx-auto grid w-full rounded-xl border border-border bg-muted p-1.5",
        game === "tic-tac-toe" && "max-w-xs gap-1.5",
        game === "connect-four" && "max-w-md gap-1",
        wide && "max-w-xl gap-px",
      )}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {board.map((value, cell) => {
        const won = winLine.includes(cell);
        return (
          <button
            key={cell}
            type="button"
            data-testid={`cell-${cell}`}
            disabled={!canMove}
            onClick={() => onPlay?.(cell)}
            aria-label={`Cell ${cell + 1}`}
            className={cn(
              "flex aspect-square items-center justify-center bg-card transition-colors",
              wide ? "rounded-[2px]" : "rounded-md",
              canMove && "cursor-pointer hover:bg-accent",
              won && "bg-success/25",
              cell === last && !won && "ring-2 ring-ring/60 ring-inset",
            )}
          >
            {value ? <Piece game={game} piece={value as 1 | 2} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export const gameLabel = (game: Game) => SPECS[game].label;
