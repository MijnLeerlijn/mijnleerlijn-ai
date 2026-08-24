import OpenAI from "openai";
import type { ImageGenerateParamsNonStreaming } from "openai/resources/images";
import { configuratieFout, providerFout } from "@/lib/ai/fouten";
import type { Beeld, BeeldProvider, BeeldVerzoek } from "../provider";

const STANDAARD_MODEL = "gpt-image-1-mini";
/** Dichtst bij liggend 4:3 wat de Images API aanbiedt (3:2 landscape). */
const STANDAARD_FORMAAT = "1536x1024";
const STANDAARD_KWALITEIT = "medium";
const TIJDSLIMIET_MS = 90_000;

type ImageParams = ImageGenerateParamsNonStreaming;

export function maakOpenAiBeeldProvider(): BeeldProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw configuratieFout("OPENAI_API_KEY ontbreekt in de omgevingsvariabelen.");
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || STANDAARD_MODEL;
  const size = (process.env.OPENAI_IMAGE_SIZE?.trim() || STANDAARD_FORMAAT) as
    ImageParams["size"];
  // Alleen de gpt-image-modellen kennen low/medium/high; bij andere modellen
  // laten we het kwaliteitsveld weg tenzij het expliciet is ingesteld.
  const kwaliteit =
    process.env.OPENAI_IMAGE_QUALITY?.trim() ||
    (model.startsWith("gpt-image") ? STANDAARD_KWALITEIT : "");

  const client = new OpenAI({ apiKey });

  return {
    naam: "openai",
    model,
    async genereerBeeld({ prompt }: BeeldVerzoek): Promise<Beeld> {
      const params: ImageParams = { model, prompt, n: 1, size, stream: false };
      if (kwaliteit) params.quality = kwaliteit as ImageParams["quality"];

      let antwoord;

      try {
        antwoord = await client.images.generate(params, {
          // Geen automatische herhaling: één mislukte tekening mag het werkblad
          // niet vertragen of extra kosten maken (fase 3, punt 13).
          maxRetries: 0,
          timeout: TIJDSLIMIET_MS,
        });
      } catch (fout) {
        throw providerFout(
          fout instanceof Error ? fout.message : "Onbekende fout bij de beeldprovider.",
        );
      }

      const eerste = antwoord.data?.[0];

      if (eerste?.b64_json) {
        return { dataUrl: `data:image/png;base64,${eerste.b64_json}`, model };
      }

      // Sommige modellen leveren alleen een tijdelijke URL; die halen we hier op
      // en zetten we om, zodat de rest van de app altijd één vorm ziet.
      if (eerste?.url) {
        return { dataUrl: await naarDataUrl(eerste.url), model };
      }

      throw providerFout("De beeldprovider gaf geen afbeelding terug.");
    },
  };
}

async function naarDataUrl(url: string): Promise<string> {
  try {
    const antwoord = await fetch(url);
    if (!antwoord.ok) throw new Error(`status ${antwoord.status}`);

    const type = antwoord.headers.get("content-type") ?? "image/png";
    const base64 = Buffer.from(await antwoord.arrayBuffer()).toString("base64");
    return `data:${type};base64,${base64}`;
  } catch (fout) {
    throw providerFout(
      `De afbeelding kon niet opgehaald worden: ${fout instanceof Error ? fout.message : "onbekende fout"}`,
    );
  }
}
