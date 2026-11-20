import { createFileRoute, Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { gameLabel } from "@/client/components/Board";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { getHistory } from "@/serverFunctions/play";

export const Route = createFileRoute("/history")({
  loader: () => getHistory(),
  head: () => ({ meta: [{ title: "History · Grid Duels" }] }),
  component: HistoryPage,
});

const RESULT = { win: "Won", loss: "Lost", draw: "Draw" } as const;

function HistoryPage() {
  const rows = Route.useLoaderData();
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="History" />
      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No finished games yet"
          action={
            <Button render={<Link to="/" />} variant="outline">
              Play a game
            </Button>
          }
        />
      ) : (
        <Table data-testid="history-table">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Opponent</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {r.finishedAt
                    ? new Date(r.finishedAt).toLocaleDateString()
                    : ""}
                </TableCell>
                <TableCell>{gameLabel(r.game)}</TableCell>
                <TableCell>{r.opponent}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.result === "win"
                        ? "default"
                        : r.result === "loss"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {RESULT[r.result]}
                    {r.byResignation ? " by resignation" : ""}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    render={
                      <Link to="/play/$matchId" params={{ matchId: r.id }} />
                    }
                  >
                    Replay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AppShell>
  );
}
