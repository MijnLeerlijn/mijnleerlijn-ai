"use client";

import { useState, type ReactNode } from "react";

export type SchooldetailTabSleutel = "trainingen" | "ai" | "logboek" | "contactpersoon";

const TABS: { sleutel: SchooldetailTabSleutel; label: string }[] = [
  { sleutel: "trainingen", label: "Trainingen" },
  { sleutel: "ai", label: "Vraag aan AI" },
  { sleutel: "logboek", label: "Logboek" },
  { sleutel: "contactpersoon", label: "Contactpersoon" },
];

/**
 * Schooldetail-UX-ronde (2026-08-25) — opdrachtseis: "Houd Trainingen als
 * hoofdscherm en zet secundaire schoolinformatie in tabs." Puur een
 * presentatielaag: page.tsx (server component) haalt alle data zoals
 * voorheen op en rendert elk paneel zelf (geen nieuwe databronnen, geen
 * verdubbelde componenten) — dit component beslist uitsluitend WELK van de
 * vier al-gerenderde panelen zichtbaar is. Alle vier panelen blijven
 * gemount (native `hidden`-attribuut i.p.v. conditioneel wegfilteren): een
 * ingetypte AI-vraag of scrollpositie in het Logboek gaat dus niet verloren
 * bij het wisselen van tab, zonder dat dit ergens een extra fetch/write
 * veroorzaakt (TrainerVraagBlok doet zelf pas iets bij een expliciete
 * form-submit, nooit bij mount).
 *
 * "Trainingen" is altijd de standaard-actieve tab (opdrachtseis). Op mobiel
 * blijft de tabbalk bruikbaar via horizontaal scrollen i.p.v. vier geplette
 * tabs (opdrachtseis) — de scrollbar zelf is verborgen voor een rustiger
 * beeld, maar de balk blijft met vinger/touchpad te bedienen.
 */
export function SchooldetailTabs({
  trainingenPaneel,
  aiPaneel,
  logboekPaneel,
  contactpersoonPaneel,
}: {
  trainingenPaneel: ReactNode;
  aiPaneel: ReactNode;
  logboekPaneel: ReactNode;
  contactpersoonPaneel: ReactNode;
}) {
  const [actief, setActief] = useState<SchooldetailTabSleutel>("trainingen");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Schoolonderdelen"
        className="flex gap-1 overflow-x-auto border-b border-grijs-200 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const isActief = actief === tab.sleutel;
          return (
            <button
              key={tab.sleutel}
              type="button"
              role="tab"
              id={`schooldetail-tab-${tab.sleutel}`}
              aria-selected={isActief}
              aria-controls={`schooldetail-paneel-${tab.sleutel}`}
              onClick={() => setActief(tab.sleutel)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-body-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-donkerblauw ${
                isActief ? "border-teal-600 text-teal-700" : "border-transparent text-grijs-500 hover:text-grijs-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div id="schooldetail-paneel-trainingen" role="tabpanel" aria-labelledby="schooldetail-tab-trainingen" hidden={actief !== "trainingen"}>
        {trainingenPaneel}
      </div>
      <div id="schooldetail-paneel-ai" role="tabpanel" aria-labelledby="schooldetail-tab-ai" hidden={actief !== "ai"} className="p-3.5">
        {aiPaneel}
      </div>
      <div id="schooldetail-paneel-logboek" role="tabpanel" aria-labelledby="schooldetail-tab-logboek" hidden={actief !== "logboek"}>
        {logboekPaneel}
      </div>
      <div id="schooldetail-paneel-contactpersoon" role="tabpanel" aria-labelledby="schooldetail-tab-contactpersoon" hidden={actief !== "contactpersoon"}>
        {contactpersoonPaneel}
      </div>
    </div>
  );
}
