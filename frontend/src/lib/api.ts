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
