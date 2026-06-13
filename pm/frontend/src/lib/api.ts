import type { BoardData, Card } from "./kanban";

export type ChatMessage = { role: string; content: string };
export type ChatResponse = { reply: string; board: BoardData };

export async function apiMe(): Promise<string | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  const data = await res.json();
  return data.username as string;
}

export async function apiLogin(username: string, password: string): Promise<boolean> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return res.ok;
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function apiGetBoard(): Promise<BoardData> {
  const res = await fetch("/api/board");
  if (!res.ok) throw new Error("Failed to fetch board");
  return res.json();
}

export async function apiRenameColumn(columnId: string, title: string): Promise<void> {
  await fetch(`/api/columns/${columnId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function apiCreateCard(columnId: string, title: string, details: string): Promise<Card> {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column_id: parseInt(columnId), title, details }),
  });
  if (!res.ok) throw new Error("Failed to create card");
  return res.json();
}

export async function apiDeleteCard(cardId: string): Promise<void> {
  await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
}

export async function apiReorder(cardId: string, columnId: string, position: number): Promise<void> {
  await fetch("/api/board/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_id: parseInt(cardId), column_id: parseInt(columnId), position }),
  });
}

export async function apiAiChat(message: string, history: ChatMessage[]): Promise<ChatResponse> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error("AI chat failed");
  return res.json();
}
