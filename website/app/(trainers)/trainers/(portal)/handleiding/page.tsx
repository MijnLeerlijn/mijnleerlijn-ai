import { redirect } from "next/navigation";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalHeadingsOp } from "@/lib/content/markdown-headings";
import { HANDLEIDING_TITEL, HANDLEIDING_MARKDOWN } from "@/lib/trainers/handleiding";
import { KennisReader } from "../kennis/[id]/kennis-reader";
import { HandleidingZoek } from "./handleiding-zoek";

export const metadata = { title: "Handleiding — Trainerportal" };

// Handleidingronde (2026-08-25) — nieuw navigatieonderdeel "Handleiding"
// (opdrachtseis), uitsluitend voor ingelogde trainers. Zelfde auth-gate-
// patroon als elke andere portalpagina (haalIngelogdeTrainer + redirect) —
// deze pagina leeft bovendien al binnen de (portal)-routegroep, die
// dezelfde gate ook al op layout-niveau afdwingt (../layout.tsx); deze
// expliciete, redundante check hier is bewust gelijk gehouden aan alle
// buurpagina's, niet omdat hij hier strikt noodzakelijk zou zijn.
//
// Bewust GEEN eigen Payload-collectie/leesquery voor de inhoud: de
// opdracht is expliciet "gebruik de volledige trainerhandleiding uit het
// artifact... herschrijf de inhoud niet opnieuw" — een statische
// tekstconstante (lib/trainers/handleiding.ts) is hier de eenvoudigste,
// meest voorspelbare bron, geen nieuw databasemodel voor content die (nu)
// niet redactioneel via de admin hoeft te worden beheerd.
//
// Hergebruikt KennisReader/KennisMarkdown ONGEWIJZIGD (opdrachtseis: "bouw
// geen tweede navigatiesysteem") — desktop-inhoudsopgave met actief-
// hoofdstuk-tracking en mobiel "Inhoud"-menu bestonden daar al exact zoals
// hier gevraagd. `headings` wordt hier server-side (puur, synchroon, geen
// browser-API's nodig) al eenmaal berekend voor de zoekfunctie hieronder;
// KennisReader berekent voor zijn eigen inhoudsopgave dezelfde lijst nog
// eens intern uit dezelfde tekst (haalHeadingsOp is een pure, goedkope
// functie) — geen props-wijziging aan dat gedeelde component nodig.
export default async function TrainerHandleidingPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const headings = haalHeadingsOp(HANDLEIDING_MARKDOWN);

  return (
    <div className="flex flex-col gap-6">
      <HandleidingZoek headings={headings} />
      <KennisReader titel={HANDLEIDING_TITEL} tekst={HANDLEIDING_MARKDOWN} />
    </div>
  );
}
