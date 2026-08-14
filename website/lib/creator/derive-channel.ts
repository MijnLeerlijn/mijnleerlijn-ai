import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";

// Creator V1 (2026-08-13) — "Maak hiervan → Nieuwsbrief/LinkedIn/Partnertekst".
// Gestructureerde output (zelfde patroon als lib/support/analyze.ts) i.p.v.
// vrije tekst + regex-parsing — betrouwbaarder voor titel/tekst/CTA-velden
// die de aanroeper rechtstreeks in een DerivedContent-record zet (zie D in
// het technisch voorstel). Werkt vanuit de AL AFGERONDE artikeltekst, geen
// nieuwe retrieval nodig — "Maak hiervan" hervormt bestaande content naar
// een ander kanaal, het haalt geen nieuwe kennis op (tenzij expliciet
// meegegeven via extraKennis, zie sectie 9 van de opdracht: "Extra kennis
// meenemen").
export type AfgeleideKanaal = "nieuwsbrief" | "linkedin" | "partnertekst";

export interface DeriveChannelOpties {
  bronTitel: string;
  bronTekst: string;
  channel: AfgeleideKanaal;
  audience?: "nieuwe_scholen" | "bestaande_scholen" | "overig";
  goal?: string;
  /** Titel+tekst van expliciet meegenomen extra kennis (sectie 9: "Extra kennis meenemen"). */
  extraKennis?: { titel: string; tekst: string }[];
}

export interface DeriveChannelResultaat {
  titel?: string;
  tekst: string;
  cta?: string;
}

const KANAAL_INSTRUCTIE: Record<AfgeleideKanaal, string> = {
  nieuwsbrief:
    "Schrijf een korte nieuwsbriefsectie: een pakkende onderwerpregel, een korte intro, de kern van het artikel in nieuwsbriefstijl, en een duidelijke call-to-action met verwijzing naar het volledige artikel. Geen samenvatting van het hele artikel — schrijf voor iemand die het nog niet gelezen heeft en over wil gaan tot de call-to-action.",
  linkedin:
    "Schrijf een LinkedIn-post. Begin met het centrale inzicht of onderwijsprobleem, niet met een samenvatting van het artikel. Bouw naar de belangrijkste conclusie, en noem MijnLeerlijn pas als (impliciete) oplossing als dat natuurlijk aanvoelt. Prikkelend en concreet, geen marketing-jargon. Geen titel nodig.",
  partnertekst:
    "Schrijf een relatief neutrale, makkelijk over te nemen tekst die partners kunnen doorsturen. Verwijs naar het volledige artikel. Vermijd een te commerciële toon. Geen titel nodig.",
};

const ResultaatSchema = z.object({
  titel: z.string().optional(),
  tekst: z.string(),
  cta: z.string().optional(),
});

function bouwDoelgroepInstructie(audience?: DeriveChannelOpties["audience"], goal?: string): string {
  const delen: string[] = [];
  if (audience === "nieuwe_scholen") {
    delen.push(
      "Doelgroep: scholen die MijnLeerlijn nog niet gebruiken — de CTA moet uitnodigen tot kennismaken/ontdekken, niet tot 'toepassen' (dat kunnen ze nog niet)."
    );
  }
  if (audience === "bestaande_scholen") {
    delen.push(
      "Doelgroep: scholen die al met MijnLeerlijn werken — de CTA moet gaan over toepassen/uitproberen van iets dat al beschikbaar is, niet over kennismaken."
    );
  }
  if (goal) delen.push(`Doel van dit stuk: ${goal}.`);
  return delen.join(" ");
}

export async function deriveerContent(opties: DeriveChannelOpties): Promise<DeriveChannelResultaat> {
  const doelgroepInstructie = bouwDoelgroepInstructie(opties.audience, opties.goal);
  const extraKennisBlok =
    opties.extraKennis && opties.extraKennis.length > 0
      ? `\n\nExtra kennis om eventueel te gebruiken:\n${opties.extraKennis.map((k) => `- ${k.titel}: ${k.tekst}`).join("\n")}`
      : "";

  // Fix-ronde (2026-08-14) — bug "AI-output bevat rare tekens/opmaak": geen
  // van de Creator-promptbouwers had een expliciete platte-tekst-instructie,
  // dus kon het model vrij markdown/code-fences/aanhalingstekens toevoegen.
  // Zelfde instructie als lib/creator/creator-chat.ts, hier ook van
  // toepassing want "tekst" landt rechtstreeks in DerivedContent.content.
  const opmaakInstructie =
    "Schrijf platte tekst, direct klaar om te publiceren/kopiëren/plakken: GEEN markdown-opmaak (geen **vet**, geen # kopjes, geen `code`-fences, geen [links]), GEEN JSON, GEEN aanhalingstekens om de hele tekst, GEEN technische metadata.";

  const systemPrompt = `Je maakt afgeleide content van een MijnLeerlijn-artikel voor het kanaal "${opties.channel}". ${KANAAL_INSTRUCTIE[opties.channel]} ${doelgroepInstructie}${extraKennisBlok}\n\n${opmaakInstructie}`.trim();

  return generateStructuredOutput({
    schema: ResultaatSchema,
    systemPrompt,
    userPrompt: `Bronartikel ("${opties.bronTitel}"):\n\n${opties.bronTekst}`,
  });
}
