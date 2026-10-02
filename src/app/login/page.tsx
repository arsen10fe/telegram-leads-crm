import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/shared/env";
import { getSession } from "../_lib/session";
import { safeNextPath } from "../_lib/session-cookie";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/leads");

  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);
  const env = getEnv();
  const demo =
    env.SHOW_DEMO_CREDENTIALS && env.SEED_MANAGER_EMAIL && env.SEED_MANAGER_PASSWORD
      ? { email: env.SEED_MANAGER_EMAIL, password: env.SEED_MANAGER_PASSWORD }
      : null;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessagesSquare className="size-5" />
          </div>
          <CardTitle className="text-xl">Lidogram</CardTitle>
          <CardDescription>CRM для заявок агентства из Telegram</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {demo ? (
            <div className="rounded-md border border-dashed bg-muted/50 p-3 text-sm">
              <p className="font-medium">Демо-доступ уже подставлен</p>
              <p className="text-muted-foreground">
                {demo.email} · {demo.password}
              </p>
            </div>
          ) : null}
          <LoginForm next={nextPath} demo={demo} />
        </CardContent>
      </Card>
    </main>
  );
}
