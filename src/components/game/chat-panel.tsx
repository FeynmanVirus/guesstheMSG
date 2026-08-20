import { MessageStream } from "@/components/game/message-stream";
import { GuessInput } from "@/components/game/guess-input";

interface ChatPanelProps {
  roomCode: string;
  live: boolean;
  isSpectator: boolean;
  myPlayerId: string | null;
  /** Null on screens with no round concept (game-results.tsx). Forwarded to
   * GuessInput so it can reset per-round state without remounting — see
   * guess-input.tsx for why this isn't a `key` on this component anymore. */
  roundId: string | null;
}

// One visual panel (mockup frames 1e/1f/1g): header, the scrolling
// chat/guess stream, and the input footer. Split into MessageStream (body)
// and GuessInput (footer) internally — this component only owns the shared
// card chrome so their existing logic didn't need re-plumbing.
//
// lg:absolute lg:inset-0 (on a lg:relative parent, see room-game.tsx/
// game-results.tsx) rather than lg:h-full: a percentage height on a grid
// item resolves as indefinite during the row's own auto-sizing pass, so
// h-full let this panel's *own* content dictate the row height instead of
// being constrained by it — every new message made the whole row (and
// everything else in it) grow instead of the message list scrolling.
// Taking the panel out of flow breaks that circularity; inset-0 then hands
// it the row's real, already-decided height.
export function ChatPanel({ roomCode, live, isSpectator, myPlayerId, roundId }: ChatPanelProps) {
  return (
    <div className="doodle-panel flex h-[420px] flex-col overflow-hidden lg:absolute lg:inset-0 lg:h-auto">
      <div className="flex items-baseline justify-between border-b-2 border-dashed border-hairline px-4 py-2.5">
        <p className="font-heading text-xl font-bold text-ink">Chat</p>
        <p className="text-[0.65rem] font-semibold text-ink-muted">type to guess</p>
      </div>
      <MessageStream myPlayerId={myPlayerId} />
      <GuessInput roomCode={roomCode} live={live} isSpectator={isSpectator} myPlayerId={myPlayerId} roundId={roundId} />
    </div>
  );
}
