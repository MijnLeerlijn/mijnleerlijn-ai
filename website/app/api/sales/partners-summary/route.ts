import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalScholenPagina } from "@/lib/sales/monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";
import { calculateSalesPartnerSummary, type SalesPartnerInput, type SalesPartnerSchoolInput } from "@/lib/sales/partner-summary";

function tekst(item: { column_values: { id: string; text: string | null }[] }, id: string): string | null {
  const value = item.column_values.find((column) => column.id === id)?.text;
  return value && value.trim() ? value.trim() : null;
}

function nummer(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessie = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!sessie.user || !heeftAdminPermissie(sessie.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor het Sales-dashboard." }, { status: 403 });
  }

  try {
    const partnersResult = await payload.find({
      collection: "sales-partners" as never,
      limit: 250,
      depth: 0,
      overrideAccess: true,
    });

    const schools: SalesPartnerSchoolInput[] = [];
    let cursor: string | null = null;
    do {
      const page = await haalScholenPagina({
        boardId: SCHOLEN_BOARD_ID,
        columnIds: [SCHOLEN_KOLOM.relatiestatus, SCHOLEN_KOLOM.aantalLeerlingen, SCHOLEN_KOLOM.binnengekomenVia],
        limit: 100,
        cursor,
      });
      for (const item of page.items) {
        const bronnen = tekst(item, SCHOLEN_KOLOM.binnengekomenVia)?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
        schools.push({
          relatiestatus: tekst(item, SCHOLEN_KOLOM.relatiestatus),
          licenties: nummer(tekst(item, SCHOLEN_KOLOM.aantalLeerlingen)),
          bronnen,
        });
      }
      cursor = page.cursor;
    } while (cursor);

    const partners = calculateSalesPartnerSummary(partnersResult.docs as unknown as SalesPartnerInput[], schools);
    return NextResponse.json({ partners }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/partners-summary] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
