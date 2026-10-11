import { ChatScreen } from "@/features/chat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return <ChatScreen key={chatId} chatId={chatId} />;
}
