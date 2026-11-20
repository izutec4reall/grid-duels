import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { gameLabel } from "@/client/components/Board";
import { ChoiceGroup } from "@/client/components/ChoiceGroup";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { GAMES } from "@/lib/rules";
import { getRankings } from "@/serverFunctions/play";

export const Route = createFileRoute("/rankings")({
  validateSearch: z.object({ game: z.enum(GAMES).catch("tic-tac-toe") }),
  loaderDeps: ({ search }) => ({ game: search.game }),
  loader: ({ deps }) => getRankings({ data: { game: deps.game } }),
  head: () => ({ meta: [{ title: "Rankings · Grid Duels" }] }),
  component: RankingsPage,
});

function RankingsPage() {
  const rows = Route.useLoaderData();
  const { game } = Route.useSearch();
  const navigate = useNavigate({ from: "/rankings" });
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Rankings"
        description="Games against the computer don't count."
      />
      <ChoiceGroup
        label="Game"
        testIdPrefix="rank-game"
        value={game}
        onChange={(g) => navigate({ search: { game: g } })}
        options={GAMES.map((g) => ({ value: g, label: gameLabel(g) }))}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={`No rated ${gameLabel(game).toLowerCase()} games yet`}
        />
      ) : (
        <Table data-testid="rankings-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">Wins</TableHead>
              <TableHead className="text-right">Losses</TableHead>
              <TableHead className="text-right">Draws</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.userId}>
                <TableCell className="tabular-nums">{i + 1}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {r.rating}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.wins}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.losses}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.draws}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AppShell>
  );
}
