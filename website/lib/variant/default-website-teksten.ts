import type { WebsiteTeksten } from "@/types/variant";

// Multi-brand variants (2026-07-30): de letterlijke, huidige MijnLeerlijn-
// copy — dit is de standaardtekst waarnaar elk leeg websiteTeksten-veld op
// een variant terugvalt (zie services/payload.ts's mapVariant()). Bewust
// GEEN per-variant afgeleide tekst (bv. met de productnaam erin verweven):
// je vroeg letterlijk "de standaardtekst van MijnLeerlijn", niet een
// automatisch aangepaste variant daarvan.
export const STANDAARD_WEBSITETEKSTEN: Omit<WebsiteTeksten, "footerTekst"> = {
  welkomsttitel: "Waar kunnen we je mee helpen?",
  welkomsttekst:
    "Stel je vraag aan de MijnLeerlijn Assistent. De assistent zoekt automatisch in onze handleidingen en kennisbank om je zo goed mogelijk te helpen.",
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
