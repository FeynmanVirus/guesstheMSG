import { RoomLobby } from "@/app/room/[code]/room-lobby";

export default async function RoomPage({ params }: PageProps<"/room/[code]">) {
  const { code } = await params;
  return <RoomLobby code={code.toUpperCase()} />;
}
