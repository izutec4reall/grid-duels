import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  Send,
  Trophy,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { Board, gameLabel, Piece } from "@/client/components/Board";
import { CopyButton } from "@/client/components/CopyButton";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { usePoll } from "@/client/hooks/usePoll";
import { REACTION_LABELS, REACTIONS, type Reaction } from "@/lib/reactions";
import { ReactionIcon } from "@/client/components/ReactionIcon";
import type { MatchView } from "@/server/matches";
import {
  getMatch,
  matchCommand,
  playMove,
  sendMessage,
} from "@/serverFunctions/play";

export const Route = createFileRoute("/play/$matchId")({
  loader: ({ params }) => getMatch({ data: { id: params.matchId } }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `${gameLabel(loaderData.game)} · Grid Duels` }]
      : [],
  }),
  component: MatchPage,
  errorComponent: MatchMissing,
});

function MatchMissing() {
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Match not found"
        description="The link may be wrong, or the match was cancelled."
      />
      <Button render={<Link to="/" />} variant="outline">
        Back to play
      </Button>
    </AppShell>
  );
}

function MatchPage() {
  const loaded = Route.useLoaderData();
  const [match, setMatch] = useState<MatchView>(loaded);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => setMatch(loaded), [loaded]);

  const finished = match.status === "finished";
  usePoll(
    async () => setMatch(await getMatch({ data: { id: match.id } })),
    1000,
    !match.rematchMatchId,
  );

  // Both players accepted a rematch: go to it.
  useEffect(() => {
    if (match.rematchMatchId && match.mySeat) {
      void navigate({
        to: "/play/$matchId",
        params: { matchId: match.rematchMatchId },
      });
    }
  }, [match.rematchMatchId, match.mySeat, navigate]);

  async function act(work: () => Promise<MatchView | null | void>) {
    setBusy(true);
    try {
      const next = await work();
      if (next) setMatch(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const { a, b } = match.players;
  const me = match.mySeat;
  const opponent = me === "a" ? b : me === "b" ? a : null;
  const firstIsA = match.firstUserId === a.id;
  const nameOf = (id: string | null) =>
    id === a.id ? a.name : id === b?.id ? b.name : "";

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={gameLabel(match.game)}
        description={
          match.tournament ? (
            <Link
              to="/tournaments/$id"
              params={{ id: match.tournament.id }}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Trophy className="size-3.5" aria-hidden />{" "}
              {match.tournament.name}
            </Link>
          ) : match.kind === "computer" ? (
            "Against the computer · unrated"
          ) : undefined
        }
      />

      {match.status === "waiting" ? (
        <WaitingPanel
          match={match}
          busy={busy}
          act={act}
          onCancelled={() => navigate({ to: "/" })}
        />
      ) : null}

      <div
        className={
          match.kind === "computer"
            ? "space-y-6"
            : "grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]"
        }
      >
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {[firstIsA ? a : b, firstIsA ? b : a].map((p, i) =>
                p ? (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm"
                  >
                    <span className="flex size-6 items-center justify-center">
                      <Piece game={match.game} piece={(i + 1) as 1 | 2} />
                    </span>
                    {p.id === (me === "a" ? a.id : me === "b" ? b?.id : null)
                      ? `${p.name} (you)`
                      : p.name}
                  </span>
                ) : null,
              )}
            </div>
            <Status match={match} nameOf={nameOf} />
          </div>

          {finished ? (
            <Replay match={match} />
          ) : (
            <Board
              game={match.game}
              moves={match.moves}
              canMove={match.canMove && !busy}
              onPlay={(cell) =>
                act(() => playMove({ data: { id: match.id, cell } }))
              }
            />
          )}

          <div className="flex flex-wrap gap-2">
            {match.status === "active" && me ? (
              <ResignButton
                busy={busy}
                onConfirm={() =>
                  act(() =>
                    matchCommand({ data: { id: match.id, action: "resign" } }),
                  )
                }
              />
            ) : null}
            {match.canRematch ? (
              <RematchButton
                match={match}
                opponentName={opponent?.name ?? ""}
                busy={busy}
                onClick={() =>
                  act(() =>
                    matchCommand({ data: { id: match.id, action: "rematch" } }),
                  )
                }
              />
            ) : null}
          </div>
        </div>
        {match.kind !== "computer" ? (
          <Chat
            match={match}
            onSent={() => act(() => getMatch({ data: { id: match.id } }))}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function Status({
  match,
  nameOf,
}: {
  match: MatchView;
  nameOf: (id: string | null) => string;
}) {
  if (match.status === "finished") {
    const mine = match.mySeat
      ? match.mySeat === "a"
        ? match.players.a.id
        : match.players.b?.id
      : null;
    const how = match.result === "resign" ? " by resignation" : "";
    const text =
      match.result === "draw"
        ? "Draw"
        : mine
          ? match.winnerId === mine
            ? `You won${how}`
            : `You lost${how}`
          : `${nameOf(match.winnerId)} won${how}`;
    return (
      <Badge
        data-testid="result"
        variant={match.result === "draw" ? "secondary" : "default"}
        className="text-sm"
      >
        {text}
      </Badge>
    );
  }
  if (match.status !== "active") return null;
  return (
    <span data-testid="turn" className="text-sm font-medium">
      {match.canMove ? (
        <span className="text-primary">Your turn</span>
      ) : (
        <span className="text-muted-foreground">
          {nameOf(match.turnUserId)} to move
        </span>
      )}
    </span>
  );
}

function WaitingPanel({
  match,
  busy,
  act,
  onCancelled,
}: {
  match: MatchView;
  busy: boolean;
  act: (work: () => Promise<MatchView | null | void>) => Promise<void>;
  onCancelled: () => void;
}) {
  if (match.canJoin) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            {match.players.a.name} is waiting for an opponent.
          </span>
          <Button
            data-testid="join-match"
            disabled={busy}
            onClick={() =>
              act(() =>
                matchCommand({ data: { id: match.id, action: "join" } }),
              )
            }
          >
            Join match
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send this link to your opponent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            data-testid="share-link"
            readOnly
            value={match.url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton value={match.url} successMessage="Link copied" />
        </div>
        {match.canCancel ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await matchCommand({
                  data: { id: match.id, action: "cancel" },
                });
                onCancelled();
              })
            }
          >
            Cancel match
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResignButton({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="outline" disabled={busy} onClick={() => setAsking(true)}>
        <Flag /> Resign
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="destructive"
        disabled={busy}
        data-testid="confirm-resign"
        onClick={onConfirm}
      >
        Resign and lose
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Keep playing
      </Button>
    </span>
  );
}

function RematchButton({
  match,
  opponentName,
  busy,
  onClick,
}: {
  match: MatchView;
  opponentName: string;
  busy: boolean;
  onClick: () => void;
}) {
  const mine = match.mySeat === "a" ? match.rematch.a : match.rematch.b;
  const theirs = match.mySeat === "a" ? match.rematch.b : match.rematch.a;
  if (mine) {
    return (
      <span className="self-center text-sm text-muted-foreground">
        Waiting for {opponentName} to accept the rematch…
      </span>
    );
  }
  return (
    <Button data-testid="rematch" disabled={busy} onClick={onClick}>
      <RotateCcw /> {theirs ? `Accept ${opponentName}'s rematch` : "Rematch"}
    </Button>
  );
}

function Replay({ match }: { match: MatchView }) {
  const total = match.moves.length;
  const [step, setStep] = useState(total);
  useEffect(() => setStep(total), [total]);
  const atEnd = step === total;
  return (
    <div className="space-y-3">
      <Board
        game={match.game}
        moves={match.moves.slice(0, step)}
        winLine={atEnd ? match.winLine : []}
        canMove={false}
      />
      <div
        className="flex items-center justify-center gap-1"
        data-testid="replay"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="First move"
          onClick={() => setStep(0)}
          disabled={step === 0}
        >
          <ChevronFirst />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous move"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
        >
          <ChevronLeft />
        </Button>
        <span
          className="min-w-28 text-center text-sm text-muted-foreground tabular-nums"
          data-testid="replay-step"
        >
          Move {step} of {total}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next move"
          onClick={() => setStep(step + 1)}
          disabled={atEnd}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Last move"
          onClick={() => setStep(total)}
          disabled={atEnd}
        >
          <ChevronLast />
        </Button>
      </div>
    </div>
  );
}

function Chat({
  match,
  onSent,
}: {
  match: MatchView;
  onSent: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const count = match.messages.length;
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [count]);

  async function send(message: { body: string } | { emoji: Reaction }) {
    setSending(true);
    try {
      await sendMessage({ data: { id: match.id, ...message } });
      if ("body" in message) setText("");
      await onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Not sent");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={log}
          data-testid="chat-log"
          className="max-h-56 space-y-1.5 overflow-y-auto text-sm"
        >
          {count === 0 ? (
            <p className="text-muted-foreground">No messages yet.</p>
          ) : null}
          {match.messages.map((m) => (
            <p key={m.id}>
              <span className="font-medium">{m.mine ? "You" : m.name}:</span>{" "}
              {m.kind === "emoji" ? (
                <span className="inline-flex items-center gap-1 align-middle text-primary">
                  <ReactionIcon
                    reaction={m.body as Reaction}
                    className="size-4"
                  />
                  <span className="sr-only">
                    {REACTION_LABELS[m.body as Reaction]}
                  </span>
                </span>
              ) : (
                m.body
              )}
            </p>
          ))}
        </div>
        {match.canChat ? (
          <>
            <div className="flex flex-wrap gap-1">
              {REACTIONS.map((emoji) => (
                <Button
                  key={emoji}
                  variant="ghost"
                  size="icon-sm"
                  data-testid={`reaction-${emoji}`}
                  aria-label={REACTION_LABELS[emoji]}
                  title={REACTION_LABELS[emoji]}
                  disabled={sending}
                  onClick={() => send({ emoji })}
                >
                  <ReactionIcon reaction={emoji} />
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) void send({ body: text });
              }}
            >
              <Input
                data-testid="chat-input"
                value={text}
                maxLength={200}
                placeholder="Message"
                aria-label="Message"
                onChange={(e) => setText(e.target.value)}
              />
              <Button
                type="submit"
                data-testid="chat-send"
                disabled={sending || !text.trim()}
                aria-label="Send"
              >
                <Send />
              </Button>
            </form>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
