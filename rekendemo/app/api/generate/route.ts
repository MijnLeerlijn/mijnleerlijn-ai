import { NextResponse } from "next/server";
import { generateWerkblad } from "@/lib/ai/generateWerkblad";
import { GeneratieFout } from "@/lib/ai/fouten";
import { parseInstellingen } from "@/lib/werkblad";

export const runtime = "nodejs";
export const maxDuration = 60;

const ONTWIKKELMODUS = process.env.NODE_ENV !== "production";

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

  const invoer = parseInstellingen(body);

  if (!invoer.ok) {
    return NextResponse.json(
      { fout: { code: "invoer", bericht: invoer.bericht } },
      { status: 400 },
    );
  }

  try {
    const uitkomst = await generateWerkblad(invoer.instellingen);

    return NextResponse.json({
      resultaat: uitkomst.resultaat,
      meta: { model: uitkomst.model, pogingen: uitkomst.pogingen },
    });
  } catch (fout) {
    const generatieFout = fout instanceof GeneratieFout ? fout : null;

    console.error("[generate] werkblad genereren mislukt", {
      code: generatieFout?.code ?? "onbekend",
      bericht: generatieFout?.message ?? String(fout),
      details: generatieFout?.details ?? [],
    });

    return NextResponse.json(
      {
        fout: {
          code: generatieFout?.code ?? "onbekend",
          bericht: "Het werkblad kon niet worden gemaakt.",
          // Technische details blijven in productie op de server.
          ...(ONTWIKKELMODUS
            ? { details: [generatieFout?.message ?? String(fout), ...(generatieFout?.details ?? [])] }
            : {}),
        },
      },
      // Een ontbrekende sleutel is onze eigen configuratiefout (500); een
      // onbruikbaar AI-antwoord komt van de provider (502).
      { status: generatieFout?.code === "configuratie" ? 500 : 502 },
    );
  }
}
