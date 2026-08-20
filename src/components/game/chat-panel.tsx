import { MessageStream } from "@/components/game/message-stream";
import { GuessInput } from "@/components/game/guess-input";

interface ChatPanelProps {
  roomCode: string;
  disabled: boolean;
  isSpectator: boolean;
  myPlayerId: string | null;
}

// One visual panel (mockup frames 1e/1f/1g): header, the scrolling
// chat/guess stream, and the input footer. Split into MessageStream (body)
// and GuessInput (footer) internally — this component only owns the shared
// card chrome so their existing logic didn't need re-plumbing.
export function ChatPanel({ roomCode, disabled, isSpectator, myPlayerId }: ChatPanelProps) {
  return (
    <div className="doodle-panel flex h-[420px] flex-col overflow-hidden lg:h-full lg:min-h-[560px]">
      <div className="flex items-baseline justify-between border-b-2 border-dashed border-hairline px-4 py-2.5">
        <p className="font-heading text-xl font-bold text-ink">Chat</p>
        <p className="text-[0.65rem] font-semibold text-ink-muted">type to guess</p>
      </div>
      <MessageStream myPlayerId={myPlayerId} />
      <GuessInput roomCode={roomCode} disabled={disabled} isSpectator={isSpectator} myPlayerId={myPlayerId} />
    </div>
  );
}
