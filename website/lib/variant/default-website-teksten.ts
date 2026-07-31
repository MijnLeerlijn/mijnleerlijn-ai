import type { WebsiteTeksten } from "@/types/variant";

// Multi-brand variants (2026-07-30): de letterlijke, huidige MijnLeerlijn-
// copy — dit is de standaardtekst waarnaar elk leeg websiteTeksten-veld op
// een variant terugvalt (zie services/payload.ts's mapVariant()).
//
// `welkomsttekst` is bewust GEEN vaste string (in tegenstelling tot de
// andere velden hier): de zin noemt de productnaam letterlijk ("de
// MijnLeerlijn Assistent") — ontdekt doordat die tekst ongewijzigd op
// MijnMonti verscheen. Zelfde patroon als `standaardFooterTekst()`
// hieronder (ook al een functie, om het jaartal in te vullen): één
// standaardtekst-sjabloon, ingevuld met de productnaam van de variant die
// hem daadwerkelijk gebruikt — geen tweede databron, geen per-slug
// uitzondering. Een door een beheerder zelf ingevulde welkomsttekst wordt
// elders (mapWebsiteTeksten()) altijd letterlijk gebruikt, zonder deze
// functie aan te roepen.
export function standaardWelkomsttekst(productNaam: string): string {
  return `Stel je vraag aan de ${productNaam} Assistent. De assistent zoekt automatisch in onze handleidingen en kennisbank om je zo goed mogelijk te helpen.`;
}

export const STANDAARD_WEBSITETEKSTEN: Omit<WebsiteTeksten, "footerTekst" | "welkomsttekst"> = {
  welkomsttitel: "Waar kunnen we je mee helpen?",
  zoekveldPlaceholder: "Beschrijf zo duidelijk mogelijk waar je tegenaan loopt…",
  helpdeskIntro: "Hoe duidelijker je vraag, hoe beter het antwoord.",
  contactTekst:
    "Kom je er met de handleidingen niet uit, of denk je dat er iets niet werkt zoals het hoort? Vul onderstaand formulier in — een collega neemt persoonlijk contact met je op.",
};

// Los van de rest: het jaartal in de standaard-footertekst is altijd het
// actuele jaar, nooit een hardcoded getal dat volgend jaar verouderd is. Een
// door een beheerder zelf ingevulde footerTekst wordt elders (mapVariant())
// altijd letterlijk gebruikt, zonder deze functie aan te roepen.
export function standaardFooterTekst(): string {
  return `© ${new Date().getFullYear()} MijnLeerlijn | Onderdeel van sCoolsuite B.V. | Privacy`;
}
