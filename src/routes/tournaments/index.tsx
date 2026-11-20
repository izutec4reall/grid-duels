import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trophy } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { gameLabel } from "@/client/components/Board";
import { ChoiceGroup } from "@/client/components/ChoiceGroup";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { GAMES, type Game } from "@/lib/rules";
import { MODE_LABELS, STATUS_LABELS, type ModeKey } from "@/lib/tournaments";
import { createTournament, getTournaments } from "@/serverFunctions/play";

export const Route = createFileRoute("/tournaments/")({
  loader: () => getTournaments(),
  head: () => ({ meta: [{ title: "Tournaments · Grid Duels" }] }),
  component: TournamentsPage,
});

type Item = Awaited<ReturnType<typeof getTournaments>>["mine"][number];

function TournamentsPage() {
  const { mine, open } = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Tournaments"
        actions={
          <Button
            data-testid="new-tournament"
            onClick={() => setCreating(true)}
          >
            <Plus /> New tournament
          </Button>
        }
      />
      <TournamentList
        title="Yours"
        items={mine}
        empty="No tournaments yet. Create one, or join one below."
        testId="my-tournaments"
      />
      <TournamentList
        title="Open to join"
        items={open}
        empty="Nothing open right now."
        testId="open-tournaments"
      />
      <CreateDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}

function TournamentList({
  title,
  items,
  empty,
  testId,
}: {
  title: string;
  items: Item[];
  empty: string;
  testId: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {items.length === 0 ? (
        <EmptyState icon={Trophy} title={empty} size="sm" />
      ) : (
        <ul
          className="divide-y divide-border rounded-xl border border-border bg-card"
          data-testid={testId}
        >
          {items.map((t) => (
            <li key={t.id}>
              <Link
                to="/tournaments/$id"
                params={{ id: t.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-muted-foreground">
                    {gameLabel(t.game)} · {MODE_LABELS[t.mode]} · {t.players}{" "}
                    {t.players === 1 ? "player" : "players"}
                  </span>
                </span>
                <Badge variant={t.status === "finished" ? "secondary" : "soft"}>
                  {STATUS_LABELS[t.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [game, setGame] = useState<Game>("tic-tac-toe");
  const [mode, setMode] = useState<ModeKey>("leaderboard");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await createTournament({ data: { name, game, mode } });
      onOpenChange(false);
      await navigate({ to: "/tournaments/$id", params: { id: t.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New tournament</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="tournament-name">Name</Label>
            <Input
              id="tournament-name"
              value={name}
              maxLength={80}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Game</Label>
            <ChoiceGroup
              label="Game"
              testIdPrefix="tgame"
              value={game}
              onChange={setGame}
              options={GAMES.map((g) => ({ value: g, label: gameLabel(g) }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Format</Label>
            <ChoiceGroup
              label="Format"
              testIdPrefix="mode"
              value={mode}
              onChange={setMode}
              options={(Object.keys(MODE_LABELS) as ModeKey[]).map((m) => ({
                value: m,
                label: MODE_LABELS[m],
              }))}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="create-tournament"
              disabled={busy || !name.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
