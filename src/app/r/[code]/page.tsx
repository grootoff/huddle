import { notFound, redirect } from "next/navigation";
import { RoomClient } from "@/components/RoomClient";
import { ROOM_CODE_PATTERN, normalizeRoomCode, prettyRoomCode } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Huddle ${prettyRoomCode(normalizeRoomCode(code))}` };
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = normalizeRoomCode(code);
  if (!ROOM_CODE_PATTERN.test(normalized)) notFound();
  // Keep one canonical URL, so a link typed in lower case still shares cleanly.
  if (normalized !== code) redirect(`/r/${normalized}`);
  return <RoomClient code={normalized} />;
}
