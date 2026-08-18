interface WaitingForHostProps {
  hostName: string | null;
  hostOffline: boolean;
}

export function WaitingForHost({ hostName, hostOffline }: WaitingForHostProps) {
  let message: string;
  if (!hostName) {
    message = "Picking a new host…";
  } else if (hostOffline) {
    message = "Host disconnected — picking a new host…";
  } else {
    message = `Waiting for ${hostName} to start the game…`;
  }

  return <p className="text-ink-muted">{message}</p>;
}
