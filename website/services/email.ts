import { Resend } from "resend";
import { isProduction, optionalEnv, requireInProduction } from "@/config/env";

// E-maildienst voor contactformulier-notificaties — zie
// docs/SECURITY-AND-PRIVACY.md en Fase 4 Stap 8. Resend is de gekozen
// leverancier (voorheen open beslissing, zie docs/TODO.md #5) — gemotiveerd
// gekozen vanwege de eenvoudige Node-SDK en goede Vercel-integratie, geen
// harde koppeling: deze module is de enige plek die Resend aanroept.
//
// Zonder RESEND_API_KEY gebruikt development een expliciete console-adapter
// die duidelijk logt dat er niets echt verstuurd is — nooit een stil
// "succes". In productie is RESEND_API_KEY verplicht (requireInProduction
// gooit anders direct een begrijpelijke fout).

export interface VerzendEmailInput {
  aan: string;
  onderwerp: string;
  tekst: string;
}

async function verzendViaConsole(input: VerzendEmailInput): Promise<void> {
  console.warn(
    `[services/email] DEVELOPMENT-ADAPTER — er is NIETS echt verstuurd.\n  Aan: ${input.aan}\n  Onderwerp: ${input.onderwerp}\n  Tekst:\n${input.tekst}`
  );
}

async function verzendViaResend(input: VerzendEmailInput, apiKey: string): Promise<void> {
  const from = optionalEnv("CONTACT_FROM_EMAIL") ?? "noreply@mijnleerlijn.nl";
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.aan,
    subject: input.onderwerp,
    text: input.tekst,
  });
  if (result.error) {
    throw new Error(`Verzenden via Resend mislukt: ${result.error.message}`);
  }
}

export async function verzendEmail(input: VerzendEmailInput): Promise<void> {
  const apiKey = requireInProduction("RESEND_API_KEY") ?? optionalEnv("RESEND_API_KEY");
  if (apiKey) {
    await verzendViaResend(input, apiKey);
    return;
  }
  if (isProduction()) {
    // requireInProduction hierboven had dit al moeten afvangen; dit is een
    // laatste vangnet zodat productie nooit stilzwijgend op de console-adapter draait.
    throw new Error("RESEND_API_KEY ontbreekt in productie — e-mail kan niet worden verstuurd.");
  }
  await verzendViaConsole(input);
}
