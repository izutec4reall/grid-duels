import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Pencil, Play, Square, Trash2, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { gameLabel } from "@/client/components/Board";
import { CopyButton } from "@/client/components/CopyButton";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { usePoll } from "@/client/hooks/usePoll";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/tournaments";
import type { TournamentView } from "@/server/tournaments";
import {
  editTournament,
  getTournament,
  tournamentCommand,
} from "@/serverFunctions/play";

export const Route = createFileRoute("/tournaments/$id")({
  loader: ({ params }) => getTournament({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `${loaderData.name} · Grid Duels` }] : [],
  }),
  component: TournamentPage,
  errorComponent: () => (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Tournament not found"
        description="The link may be wrong, or the tournament was deleted."
      />
      <Button render={<Link to="/tournaments" />} variant="outline">
        All tournaments
      </Button>
    </AppShell>
  ),
});

type Action = "join" | "leave" | "start" | "stop" | "delete";

function TournamentPage() {
  const loaded = Route.useLoaderData();
  const [t, setT] = useState<TournamentView>(loaded);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  useEffect(() => setT(loaded), [loaded]);
  usePoll(
    async () => setT(await getTournament({ data: { id: t.id } })),
    2000,
    t.status !== "finished",
  );

  async function command(action: Action) {
    setBusy(true);
    try {
      const next = await tournamentCommand({ data: { id: t.id, action } });
      if (action === "delete") await navigate({ to: "/tournaments" });
      else if (next) setT(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const started = t.status !== "open";
  const rounds = new Map<number, TournamentView["matches"]>();
  for (const m of t.matches) {
    const key = m.round ?? 0;
    rounds.set(key, [...(rounds.get(key) ?? []), m]);
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={t.name}
        description={`${gameLabel(t.game)} · ${MODE_LABELS[t.mode]} · organized by ${t.organizer.name}`}
        backLink={
          <Link
            to="/tournaments"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Tournaments
          </Link>
        }
        actions={
          <>
            <Badge variant={t.status === "finished" ? "secondary" : "soft"}>
              {STATUS_LABELS[t.status]}
            </Badge>
            {t.canJoin ? (
              <Button
                data-testid="join-tournament"
                disabled={busy}
                onClick={() => command("join")}
              >
                Join
              </Button>
            ) : null}
            {t.canLeave ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => command("leave")}
              >
                Leave
              </Button>
            ) : null}
            {t.canManage && t.status === "open" ? (
              <Button
                data-testid="start-tournament"
                disabled={busy || t.players.length < 2}
                onClick={() => command("start")}
              >
                <Play /> Start
              </Button>
            ) : null}
            {t.canManage && t.status === "running" ? (
              <Button
                data-testid="stop-tournament"
                variant="outline"
                disabled={busy}
                onClick={() => command("stop")}
              >
                <Square /> Stop
              </Button>
            ) : null}
            {t.canManage ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  onClick={() => setRenaming(true)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {t.winner ? (
        <Alert variant="success" data-testid="champion">
          <Trophy />
          <AlertDescription>
            {t.winner.name} won the tournament.
          </AlertDescription>
        </Alert>
      ) : null}

      {t.status === "open" ||
      (t.status === "running" && t.mode === "leaderboard") ? (
        <div className="flex gap-2">
          <Input
            readOnly
            value={t.url}
            aria-label="Tournament link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton value={t.url} successMessage="Link copied" />
        </div>
      ) : null}

      {!started ? (
        <Card>
          <CardHeader>
            <CardTitle>Players ({t.players.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2 text-sm" data-testid="players">
              {t.players.map((p) => (
                <li
                  key={p.id}
                  className="rounded-full border border-border px-3 py-1"
                >
                  {p.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Standings</h2>
          <Table data-testid="standings">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">W</TableHead>
                <TableHead className="text-right">D</TableHead>
                <TableHead className="text-right">L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.standings.map((s, i) => (
                <TableRow key={s.userId}>
                  <TableCell className="tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    {s.name}{" "}
                    {s.eliminated ? (
                      <Badge variant="secondary">Out</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.points}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.wins}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.draws}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.losses}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {t.matches.length > 0 ? (
        <section className="space-y-4" data-testid="tournament-matches">
          {[...rounds.entries()].map(([round, list]) => (
            <div key={round} className="space-y-2">
              <h2 className="text-base font-semibold">
                {round ? `Round ${round}` : "Games"}
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {list.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span>
                      {m.bye ? (
                        <>
                          {m.a.name}{" "}
                          <span className="text-muted-foreground">
                            advances without playing
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className={
                              m.winnerId === m.a.id
                                ? "font-semibold"
                                : undefined
                            }
                          >
                            {m.a.name}
                          </span>
                          <span className="text-muted-foreground"> vs </span>
                          <span
                            className={
                              m.winnerId === m.b?.id
                                ? "font-semibold"
                                : undefined
                            }
                          >
                            {m.b?.name}
                          </span>
                          {m.status === "finished" && !m.winnerId ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · draw
                            </span>
                          ) : null}
                        </>
                      )}
                    </span>
                    {m.bye ? null : (
                      <Button
                        size="sm"
                        variant={m.status === "active" ? "default" : "outline"}
                        render={
                          <Link
                            to="/play/$matchId"
                            params={{ matchId: m.id }}
                          />
                        }
                      >
                        {m.status === "active" ? "Open" : "Replay"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        t={t}
        onSaved={setT}
      />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {t.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Its standings are lost. Games already played stay in each player's
            history.
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => command("delete")}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  t,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TournamentView;
  onSaved: (t: TournamentView) => void;
}) {
  const [name, setName] = useState(t.name);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setName(t.name);
  }, [open, t.name]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              onSaved(await editTournament({ data: { id: t.id, name } }));
              onOpenChange(false);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "That didn't work",
              );
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename tournament</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rename">Name</Label>
            <Input
              id="rename"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
