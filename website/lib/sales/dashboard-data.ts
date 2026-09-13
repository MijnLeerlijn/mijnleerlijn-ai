import type { Payload } from "payload";
import { haalScholenPagina, mondayQuery, type MondaySchoolItem } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";

const VERKOOPREGELS_BOARD_ID = "18420120443";
const VERKOOPREGEL_KOLOM = {
  school: "board_relation_mm4v2t8y",
  product: "board_relation_mm4vpq2h",
  aantal: "numeric_mm5se9vp",
  verkoopprijs: "numeric_mm5sf441",
  schooljaar: "dropdown_mm5rr19j",
  verkoopdatum: "date_mm5rnabm",
  status: "color_mm5rkmrn",
} as const;

const OMZETSTATUSSEN = new Set(["Gereed", "In uitvoering", "Afgerond"]);
const OPEN_RELATIESTATUSSEN = new Set(["Lead", "Prospect", "Wacht op handtekening"]);

export interface DashboardReeksPunt {
  label: string;
  waarde: number;
}

export interface SalesDashboardData {
  gegenereerdOp: string;
  kpis: {
    omzetTotaal: number;
    omzetDitJaar: number;
    klanten: number;
    leerlingenBijKlanten: number;
    openPipeline: number;
    gemiddeldeOmzetPerKlant: number;
  };
  omzetPerProduct: DashboardReeksPunt[];
  omzetPerMaand: DashboardReeksPunt[];
  funnel: DashboardReeksPunt[];
  klantenGeworden: DashboardReeksPunt[];
  klantenPerOnderwijstype: DashboardReeksPunt[];
  historie: {
    transities: number;
    volledigeTransities: number;
    eersteWaardeZonderVorige: number;
  };
}

function kolom(item: MondaySchoolItem, id: string) {
  return item.column_values.find((c) => c.id === id);
}

function tekst(item: MondaySchoolItem, id: string): string | null {
  const value = kolom(item, id)?.text;
  return value && value.trim() ? value.trim() : null;
}

function nummer(item: MondaySchoolItem, id: string): number {
  const raw = tekst(item, id);
  if (!raw) return 0;
  const parsed = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function relatieIds(item: MondaySchoolItem, id: string): string[] {
  return (kolom(item, id)?.linked_item_ids ?? []).map(String);
}

async function haalAlleItems(boardId: string, columnIds: string[]): Promise<MondaySchoolItem[]> {
  const alle: MondaySchoolItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await haalScholenPagina({ boardId, columnIds, limit: 100, cursor });
    alle.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return alle;
}

async function haalItemNamen(ids: string[]): Promise<Map<string, string>> {
  const uniek = [...new Set(ids)].filter(Boolean);
  const result = new Map<string, string>();
  for (let i = 0; i < uniek.length; i += 100) {
    const chunk = uniek.slice(i, i + 100);
    const query = `query DashboardItemNames($ids: [ID!]) { items(ids: $ids) { id name } }`;
    const data = await mondayQuery<{ items: { id: string; name: string }[] }>(query, { ids: chunk });
    for (const item of data.items ?? []) result.set(String(item.id), item.name);
  }
  return result;
}

function voegToe(map: Map<string, number>, label: string, waarde: number) {
  map.set(label, (map.get(label) ?? 0) + waarde);
}

function naarReeks(map: Map<string, number>, sorteerOpWaarde = true): DashboardReeksPunt[] {
  const reeks = [...map.entries()].map(([label, waarde]) => ({ label, waarde }));
  return reeks.sort(sorteerOpWaarde ? (a, b) => b.waarde - a.waarde : (a, b) => a.label.localeCompare(b.label, "nl"));
}

export async function bouwSalesDashboardData(payload: Payload): Promise<SalesDashboardData> {
  const [scholen, verkoopregels] = await Promise.all([
    haalAlleItems(SCHOLEN_BOARD_ID, [
      SCHOLEN_KOLOM.relatiestatus,
      SCHOLEN_KOLOM.salesfase,
      SCHOLEN_KOLOM.aantalLeerlingen,
      SCHOLEN_KOLOM.typeSchool,
      SCHOLEN_KOLOM.klantGeworden,
      SCHOLEN_KOLOM.whitelabel,
    ]),
    haalAlleItems(VERKOOPREGELS_BOARD_ID, Object.values(VERKOOPREGEL_KOLOM)),
  ]);

  const productIds = verkoopregels.flatMap((regel) => relatieIds(regel, VERKOOPREGEL_KOLOM.product));
  const productNamen = await haalItemNamen(productIds);
  const huidigJaar = new Date().getFullYear();

  let omzetTotaal = 0;
  let omzetDitJaar = 0;
  const omzetPerProduct = new Map<string, number>();
  const omzetPerMaand = new Map<string, number>();

  for (const regel of verkoopregels) {
    const status = tekst(regel, VERKOOPREGEL_KOLOM.status);
    if (!status || !OMZETSTATUSSEN.has(status)) continue;
    const totaal = nummer(regel, VERKOOPREGEL_KOLOM.aantal) * nummer(regel, VERKOOPREGEL_KOLOM.verkoopprijs);
    if (!Number.isFinite(totaal) || totaal === 0) continue;
    omzetTotaal += totaal;

    const verkoopdatum = tekst(regel, VERKOOPREGEL_KOLOM.verkoopdatum);
    if (verkoopdatum) {
      const d = new Date(verkoopdatum);
      if (!Number.isNaN(d.getTime())) {
        if (d.getFullYear() === huidigJaar) omzetDitJaar += totaal;
        const maand = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        voegToe(omzetPerMaand, maand, totaal);
      }
    }

    const ids = relatieIds(regel, VERKOOPREGEL_KOLOM.product);
    if (ids.length === 0) {
      voegToe(omzetPerProduct, "Onbekend product", totaal);
    } else {
      // Een verkoopregel hoort praktisch bij één product. Als Monday toch
      // meerdere relaties bevat, verdelen we de regel niet stilzwijgend:
      // dezelfde regel wordt onder een gecombineerde, traceerbare naam gezet.
      const label = ids.map((id) => productNamen.get(id) ?? `Product #${id}`).join(" + ");
      voegToe(omzetPerProduct, label, totaal);
    }
  }

  const funnel = new Map<string, number>();
  const klantenGeworden = new Map<string, number>();
  const klantenPerOnderwijstype = new Map<string, number>();
  let klanten = 0;
  let leerlingenBijKlanten = 0;
  let openPipeline = 0;

  for (const school of scholen) {
    const relatie = tekst(school, SCHOLEN_KOLOM.relatiestatus) ?? "Onbekend";
    voegToe(funnel, relatie, 1);
    if (OPEN_RELATIESTATUSSEN.has(relatie)) openPipeline++;
    if (relatie !== "Klant") continue;

    klanten++;
    leerlingenBijKlanten += nummer(school, SCHOLEN_KOLOM.aantalLeerlingen);
    const geworden = tekst(school, SCHOLEN_KOLOM.klantGeworden);
    if (geworden) voegToe(klantenGeworden, geworden, 1);
    const types = tekst(school, SCHOLEN_KOLOM.typeSchool)?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
    if (types.length === 0) voegToe(klantenPerOnderwijstype, "Onbekend", 1);
    for (const type of types) voegToe(klantenPerOnderwijstype, type, 1);
  }

  const historieResult = await payload.find({
    collection: "sales-log-events",
    where: { type: { equals: "monday_status" } },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  });
  let volledigeTransities = 0;
  let eersteWaardeZonderVorige = 0;
  for (const doc of historieResult.docs) {
    const context = (doc as unknown as { payload?: { bronkwaliteit?: string } | null }).payload;
    if (context?.bronkwaliteit === "volledig") volledigeTransities++;
    else if (context?.bronkwaliteit === "alleen_nieuwe_waarde") eersteWaardeZonderVorige++;
  }

  return {
    gegenereerdOp: new Date().toISOString(),
    kpis: {
      omzetTotaal,
      omzetDitJaar,
      klanten,
      leerlingenBijKlanten,
      openPipeline,
      gemiddeldeOmzetPerKlant: klanten > 0 ? omzetTotaal / klanten : 0,
    },
    omzetPerProduct: naarReeks(omzetPerProduct),
    omzetPerMaand: naarReeks(omzetPerMaand, false),
    funnel: naarReeks(funnel),
    klantenGeworden: naarReeks(klantenGeworden, false),
    klantenPerOnderwijstype: naarReeks(klantenPerOnderwijstype),
    historie: {
      transities: historieResult.totalDocs,
      volledigeTransities,
      eersteWaardeZonderVorige,
    },
  };
}
