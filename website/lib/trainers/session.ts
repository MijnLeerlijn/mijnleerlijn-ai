import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME, type AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V1, Ronde 1 (2026-08-19) — gedeelde "wie is ingelogd"-
// opzoeking voor Server Components onder app/(trainers)/trainers/(portal)/.
// Buiten Payload's admin-boom bestaat geen automatische user/req-injectie
// (dat is een Payload-specifiek mechanisme voor admin.components.views), dus
// leest dit de sessiecookie zelf via next/headers — zelfde bewezen
// bouwstenen (getPayload + verifyTrainerSessionCookie) als de bestaande
// API-routes, alleen via cookies() i.p.v. request.cookies.get(...) omdat een
// Server Component geen NextRequest ontvangt. Eén plek i.p.v. dit in elke
// pagina/layout te herhalen (layout.tsx, page.tsx, scholen/page.tsx,
// scholen/[school]/page.tsx, profiel/page.tsx gebruiken dit allemaal).
export async function haalIngelogdeTrainer(): Promise<AuthTrainer | null> {
  const payload = await getPayload({ config });
  const cookieStore = await cookies();
  const controle = await verifyTrainerSessionCookie(payload, cookieStore.get(TRAINER_SESSION_COOKIE_NAME)?.value);
  return controle.trainer;
}
