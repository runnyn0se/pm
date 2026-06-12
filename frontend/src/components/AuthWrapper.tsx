"use client";

import { useEffect, useState } from "react";
import { apiMe } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginPage } from "@/components/LoginPage";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export const AuthWrapper = () => {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    apiMe().then((username) => {
      setAuthState(username ? "authenticated" : "unauthenticated");
    });
  }, []);

  if (authState === "loading") return null;
  if (authState === "unauthenticated") {
    return <LoginPage onLogin={() => setAuthState("authenticated")} />;
  }
  return <KanbanBoard onLogout={() => setAuthState("unauthenticated")} />;
};
