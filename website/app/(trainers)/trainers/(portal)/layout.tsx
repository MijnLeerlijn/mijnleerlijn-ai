import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { TrainerPortalNav } from "./trainer-portal-nav";

// Auth-gate voor alle echte portalpagina's (Dashboard, Mijn scholen,
// Schooldetail, Profiel) — NIET voor /login, dat leeft bewust buiten deze
// route-groep (zie app/(trainers)/trainers/login/page.tsx) zodat een
// uitgelogde trainer daar nooit door deze redirect-lus kan lopen.
// Route-group "(portal)" voegt geen padsegment toe — dit is dus een gewone,
// geneste layout binnen dezelfde root-layout (app/(trainers)/layout.tsx),
// geen tweede "multiple root layouts"-geval.
//
// BELANGRIJK — nooit "/trainers/login" hier: proxy.ts se
// trainersPortalRewrite() is een REWRITE, geen redirect (NextResponse.
// rewrite, node_modules/next/dist/docs/.../rewrites.md: "makes it appear
// the user hasn't changed their location"). De browser ziet dus altijd het
// KALE pad ("/", "/login", "/scholen", ...) — "/trainers" bestaat
// uitsluitend server-side, als bestandslocatie. Een redirect()/Link/
// router.push() hier verwijst naar wat de BROWSER ziet, dus altijd het kale
// pad; "/trainers/login" zou opnieuw door de rewrite lopen (host is nog
// steeds trainers.{ROOT_DOMAIN}) en op "/trainers/trainers/login" (404)
// uitkomen — live gevonden en bevestigd via een echte Playwright-navigatie.
export default async function TrainerPortalLayout({ children }: { children: ReactNode }) {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <TrainerPortalNav trainerNaam={trainer.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
