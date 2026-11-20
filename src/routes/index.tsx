import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Bot, Globe, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { gameLabel, Piece } from "@/client/components/Board";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Spinner } from "@/client/components/ui/spinner";
import { usePoll } from "@/client/hooks/usePoll";
import { GAMES, SPECS, type Game } from "@/lib/rules";
import type { QueueState } from "@/server/queue";
import {
  createMatch,
  getLobby,
  getQueue,
  joinQueue,
  leaveQueue,
} from "@/serverFunctions/play";

export const Route = createFileRoute("/")({
  loader: () => getLobby(),
  head: () => ({ meta: [{ title: "Grid Duels" }] }),
  component: Lobby,
});

function Lobby() {
  const { open, queue: initialQueue } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [game, setGame] = useState<Game>(
    initialQueue.state === "waiting" ? initialQueue.game : "tic-tac-toe",
  );
  const [queue, setQueue] = useState<QueueState>(initialQueue);
  const [busy, setBusy] = useState(false);

  const goTo = (matchId: string) =>
    navigate({ to: "/play/$matchId", params: { matchId } });

  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  // Paired while away from this page: go to the match.
  useEffect(() => {
    if (initialQueue.state === "matched") void goTo(initialQueue.matchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQueue]);

  usePoll(
    async () => {
      const next = await getQueue();
      setQueue(next);
      if (next.state === "matched") await goTo(next.matchId);
    },
    1500,
    queue.state === "waiting",
  );

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Play" />

      <section className="space-y-3">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Game">
          {GAMES.map((g) => (
            <button
              key={g}
              type="button"
              data-testid={`game-${g}`}
              aria-pressed={game === g}
              onClick={() => setGame(g)}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              <span className="flex h-8 items-center gap-1">
                <span className="flex size-7 items-center justify-center">
                  <Piece game={g} piece={1} />
                </span>
                <span className="flex size-7 items-center justify-center">
                  <Piece game={g} piece={2} />
                </span>
              </span>
              <span className="text-sm font-medium">{gameLabel(g)}</span>
              <span className="text-xs text-muted-foreground">
                {SPECS[g].cols}×{SPECS[g].rows}, {SPECS[g].line} in a row
              </span>
            </button>
          ))}
        </div>

        {queue.state === "waiting" ? (
          <Card data-testid="queue-waiting">
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Spinner />
                Looking for an opponent for{" "}
                {gameLabel(queue.game).toLowerCase()}…
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => act(async () => setQueue(await leaveQueue()))}
              >
                Leave queue
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              size="lg"
              data-testid="invite-friend"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const match = await createMatch({
                    data: { game, opponent: "friend" },
                  });
                  await goTo(match.id);
                })
              }
            >
              <Link2 /> Invite a friend
            </Button>
            <Button
              size="lg"
              variant="outline"
              data-testid="play-online"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const next = await joinQueue({ data: { game } });
                  setQueue(next);
                  if (next.state === "matched") await goTo(next.matchId);
                })
              }
            >
              <Globe /> Play online
            </Button>
            <Button
              size="lg"
              variant="outline"
              data-testid="play-computer"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const match = await createMatch({
                    data: { game, opponent: "computer" },
                  });
                  await goTo(match.id);
                })
              }
            >
              <Bot /> Play the computer
            </Button>
          </div>
        )}
      </section>

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Your games</h2>
          <ul
            className="divide-y divide-border rounded-xl border border-border bg-card"
            data-testid="open-matches"
          >
            {open.map((m) => (
              <li key={m.id}>
                <Link
                  to="/play/$matchId"
                  params={{ matchId: m.id }}
                  onClick={() => router.invalidate()}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted"
                >
                  <span>
                    {gameLabel(m.game)}
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {m.opponent
                        ? `vs ${m.opponent}`
                        : "waiting for someone to join"}
                    </span>
                  </span>
                  {m.status === "active" && m.myTurn ? (
                    <Badge>Your turn</Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
