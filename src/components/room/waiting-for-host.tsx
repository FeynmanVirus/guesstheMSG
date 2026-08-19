interface WaitingForHostProps {
  hostName: string | null;
  hostOffline: boolean;
  /** Completes "Waiting for <host> to …" — defaults to the lobby's own
   * phrasing; the results screen passes "start a new game" (restart-room-
   * form.tsx). */
  action?: string;
}

export function WaitingForHost({ hostName, hostOffline, action = "start the game" }: WaitingForHostProps) {
  let message: string;
  if (!hostName) {
    message = "Picking a new host…";
  } else if (hostOffline) {
    message = "Host disconnected — picking a new host…";
  } else {
    message = `Waiting for ${hostName} to ${action}…`;
  }

  return <p className="text-ink-muted">{message}</p>;
}
