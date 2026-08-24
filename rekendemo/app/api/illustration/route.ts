import { NextResponse } from "next/server";
import { GeneratieFout } from "@/lib/ai/fouten";
import { buildIllustrationPrompt } from "@/lib/images/buildIllustrationPrompt";
import { maakBeeldProvider } from "@/lib/images/provider";
import { EILANDEN, LEERJAREN, type EilandId, type LeerjaarId } from "@/lib/werkblad";

export const runtime = "nodejs";
export const maxDuration = 120;

const ONTWIKKELMODUS = process.env.NODE_ENV !== "production";
const MAX_TEKSTLENGTE = 600;

type Invoer = {
  eiland: EilandId;
  leerjaar: LeerjaarId;
  illustrationDescription: string;
  tekenwens: string;
};

function leesInvoer(onbekend: unknown): { ok: true; invoer: Invoer } | { ok: false; bericht: string } {
  if (typeof onbekend !== "object" || onbekend === null) {
    return { ok: false, bericht: "Geen geldige invoer ontvangen." };
  }

  const ruw = onbekend as Record<string, unknown>;

  const eiland = EILANDEN.find((optie) => optie.id === ruw.eiland)?.id;
  if (!eiland) return { ok: false, bericht: "Onbekend eiland." };

  const leerjaar = LEERJAREN.find((optie) => optie.id === ruw.leerjaar)?.id;
  if (!leerjaar) return { ok: false, bericht: "Onbekend leerjaar." };

  const illustrationDescription =
    typeof ruw.illustrationDescription === "string"
      ? ruw.illustrationDescription.trim()
      : "";
  if (illustrationDescription.length === 0) {
    return { ok: false, bericht: "Geen illustratiebeschrijving ontvangen." };
  }
  if (illustrationDescription.length > MAX_TEKSTLENGTE) {
    return { ok: false, bericht: "De illustratiebeschrijving is te lang." };
  }

  const tekenwens = typeof ruw.tekenwens === "string" ? ruw.tekenwens.trim() : "";
  if (tekenwens.length > MAX_TEKSTLENGTE) {
    return { ok: false, bericht: "De tekenwens is te lang." };
  }

  return {
    ok: true,
    invoer: { eiland, leerjaar, illustrationDescription, tekenwens },
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { fout: { code: "invoer", bericht: "Ongeldig verzoek." } },
      { status: 400 },
    );
  }

  const gelezen = leesInvoer(body);

  if (!gelezen.ok) {
    return NextResponse.json(
      { fout: { code: "invoer", bericht: gelezen.bericht } },
      { status: 400 },
    );
  }

  const prompt = buildIllustrationPrompt(gelezen.invoer);

  try {
    const provider = maakBeeldProvider();
    const beeld = await provider.genereerBeeld({ prompt });

    return NextResponse.json({
      afbeelding: { dataUrl: beeld.dataUrl },
      meta: {
        model: beeld.model,
        // De prompt bevat alleen stijl- en scènetekst, nooit configuratie of sleutels.
        ...(ONTWIKKELMODUS ? { prompt } : {}),
      },
    });
  } catch (fout) {
    const generatieFout = fout instanceof GeneratieFout ? fout : null;

    console.error("[illustration] tekening maken mislukt", {
      code: generatieFout?.code ?? "onbekend",
      bericht: generatieFout?.message ?? String(fout),
    });

    return NextResponse.json(
      {
        fout: {
          code: generatieFout?.code ?? "onbekend",
          bericht: "De tekening kon niet worden gemaakt.",
          ...(ONTWIKKELMODUS
            ? { details: [generatieFout?.message ?? String(fout)] }
            : {}),
        },
      },
      { status: generatieFout?.code === "configuratie" ? 500 : 502 },
    );
  }
}
