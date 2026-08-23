import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";
import { buildArticleText, type ArticleVoorEmbedding } from "@/lib/embeddings/embeddable-text";

// Vervolgronde (2026-08-22) — "Maak trainerversie": herschrijft een bestaand
// kennisartikel tot een trainerperspectief-versie. Zelfde vorm als
// lib/creator/variant-adapt.ts ("Maak [variant]-versie") en
// lib/creator/derive-channel.ts ("Maak hiervan") — bronartikel -> AI
// herschrijft voor een ander publiek -> beheerder controleert/bewerkt/
// publiceert. Bewust GEEN kennisopzoeking (i.t.t. variant-adapt): de
// trainerversie moet exact dezelfde feiten bevatten als de bron zelf, dus
// die bron is het enige toegestane brondocument — "geen nieuwe inhoudelijke
// feiten verzinnen die niet uit de bron komen" (opdrachtseis).
// buildArticleText (lib/embeddings/embeddable-text.ts) hergebruikt de al-
// bestaande, al-geteste artikel-naar-platte-tekst-omzetting — geen tweede
// interpretatie van "wat is de tekst van dit artikel".
//
// Kennisbasis-basiskennis (2026-08-23) — dezelfde herschrijffunctie bedient
// nu ook de centrale Kennisbasis (payload/components/KennisbasisView.tsx,
// een `knowledge-sources`-rij met bronrol "background-model", zie
// lib/assistant/kennisbasis-context.ts): dat veld is al platte tekst, dus
// geen buildArticleText nodig — vandaar de losgetrokken
// genereerTrainerversieVanTekst() hieronder, die genereerTrainerversie() nu
// zelf ook gebruikt. Éen systeemprompt/AI-aanroep voor beide bronnen, geen
// tweede, uit de pas kunnen lopen implementatie.
export interface TrainerversieResultaat {
  titel: string;
  tekst: string;
}

const TrainerversieSchema = z.object({
  titel: z.string(),
  tekst: z.string(),
});

const SYSTEEMPROMPT = `Je herschrijft een MijnLeerlijn-kennisartikel tot een trainerversie — bedoeld voor trainers die scholen begeleiden, niet voor de school zelf.

Belangrijkste regel: gebruik UITSLUITEND de feiten die letterlijk in het originele artikel hieronder staan. Verzin nooit nieuwe informatie, voorbeelden, cijfers of adviezen die daar niet in staan.

Herstructureer de tekst vanuit trainersperspectief, bijvoorbeeld rond:
- Wat moet ik als trainer weten?
- Hoe leg ik dit uit aan een school?
- Waar moet ik tijdens begeleiding op letten?
- Veelvoorkomende vragen of valkuilen — uitsluitend als het origineel daar echt aanknopingspunten voor biedt, verzin geen vragen die er niet in staan.

Niet elk artikel leent zich voor alle vier de onderdelen — gebruik alleen wat inhoudelijk klopt bij dít artikel, dwing geen kopje af zonder inhoud.

Titel: herschrijf de titel vanuit trainersperspectief (bijvoorbeeld niet "Zo bereid je als school een periode voor" maar "Zo begeleid je een school bij het voorbereiden van een periode"). Blijf dicht bij het origineel onderwerp, verzin geen nieuw onderwerp.

Schrijf platte tekst, geen markdown-opmaak (geen **vet**, geen # kopjes, geen \`code\`-fences) — gewone kopjes als losse regels mag wel, indien dat de leesbaarheid helpt. Schrijf in het Nederlands, feitelijk en vriendelijk.

Antwoord uitsluitend met het gevraagde gestructureerde object.`;

/**
 * Gedeelde kern: herschrijft willekeurige brontekst (al platte tekst) tot een
 * trainerversie. `bronLabel` is uitsluitend het label in de prompt ("artikel"/
 * "kennisbasis") — verandert niets aan de regels zelf.
 */
export async function genereerTrainerversieVanTekst(bronTitel: string, brontekst: string, bronLabel = "artikel"): Promise<TrainerversieResultaat> {
  const ruweOutput = await generateStructuredOutput({
    schema: TrainerversieSchema,
    systemPrompt: SYSTEEMPROMPT,
    userPrompt: `Origineel ${bronLabel} ("${bronTitel}"):\n\n${brontekst}\n\nSchrijf de trainerversie.`,
  });
  return { titel: ruweOutput.titel.trim(), tekst: ruweOutput.tekst.trim() };
}

export async function genereerTrainerversie(bronArtikel: ArticleVoorEmbedding): Promise<TrainerversieResultaat> {
  return genereerTrainerversieVanTekst(bronArtikel.title, buildArticleText(bronArtikel), "artikel");
}
