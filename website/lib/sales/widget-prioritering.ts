import type { Payload } from "payload";
import { PENDING_VOORSTEL_TYPES_VOOR_AANDACHT, vindActieveScholenZonderVervolgactie } from "./aandacht-nodig";

// Sales UX V2 (2026-08-14) — deterministische, uitlegbare prioritering voor
// de dashboardwidget ("Waar moet ik vandaag commercieel aandacht aan
// geven?"). AI bepaalt NOOIT de volgorde — alleen de (al bestaande, al
// opgeslagen) toelichtende tekst per kaart. Vier vaste tiers, strikt in
// volgorde gevuld tot maxItems; een lagere tier wordt nooit gebruikt zolang
// een hogere tier nog ongebruikte kandidaten heeft.
//
// Reikwijdte (expliciete bouweis, 2026-08-14): Lead/Prospect/Wacht op
// handtekening zijn overal kandidaat; Klant uitsluitend via tier 1 (een
// daadwerkelijk openstaande, vandaag/achterstallige actie) — nooit via
// AI-voorstel of "geen contact"-tier; Gestopt/Inactief nooit.
export type WidgetTier = 1 | 2 | 3 | 4;

export interface WidgetSchoolItem {
  id: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
  onderwijstype: { id: number; name: string } | number | null;
  lastMondayActivityAt: string | null;
  tier: WidgetTier;
  reden: string;
  contextTekst: string | null;
}

export interface KandidaatSchool {
  id: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
  onderwijstype: { id: number; name: string } | number | null;
  lastMondayActivityAt: string | null;
}

export interface OpenActieBasis {
  schoolId: number;
  dueDate: string;
  description: string;
}

export interface VoorstelBasis {
  schoolId: number;
  confidence: "hoog" | "middel" | "laag" | null;
  reason: string | null;
  createdAt: string;
}

const KLANT = "Klant";
const ACTIEF_STATUSSEN = ["Lead", "Prospect", "Wacht op handtekening"];
const WIDGET_TOEGESTANE_STATUSSEN = [...ACTIEF_STATUSSEN, KLANT];

/**
 * Pure tier-toewijzing — geen database-toegang, dus rechtstreeks en
 * deterministisch testbaar. `berekenSalesWidget` hieronder doet het
 * ophalen en roept dit aan.
 */
export function bepaalWidgetTiers(
  scholen: KandidaatSchool[],
  openActies: OpenActieBasis[],
  voorstellen: VoorstelBasis[],
  vandaagIso: string,
  maxItems: number
): Omit<WidgetSchoolItem, "contextTekst">[] {
  const scholenPerId = new Map(scholen.map((s) => [s.id, s]));

  // Twee sporen per bron, bewust gescheiden:
  // - "vandaag/achterstallig" (tier 1) resp. "hoog/middel vertrouwen" (tier
  //   2/3) — wat de widget daadwerkelijk TOONT.
  // - "heeft er überhaupt één" (ongeacht datum/vertrouwen) — bepaalt tier 4
  //   (veiligheidsnet): een school met een toekomstige actie of een
  //   laag-vertrouwen-voorstel heeft al wél iets lopen en hoort dus NIET in
  //   "geen vervolgactie gepland" — ontdekt via de eigen tests van deze
  //   functie (een school met alléén een actie volgende week viel er
  //   zonder deze scheiding onterecht in).
  const schoolIdsMetEnigeOpenActie = new Set(openActies.map((a) => a.schoolId));
  const schoolIdsMetEnigVoorstel = new Set(voorstellen.map((v) => v.schoolId));

  const laatsteOpenActiePerSchool = new Map<number, OpenActieBasis>();
  for (const actie of openActies) {
    if (actie.dueDate.slice(0, 10) > vandaagIso) continue; // alleen vandaag/achterstallig telt voor tier 1
    const huidig = laatsteOpenActiePerSchool.get(actie.schoolId);
    if (!huidig || actie.dueDate < huidig.dueDate) laatsteOpenActiePerSchool.set(actie.schoolId, actie); // langst achterstallig wint
  }

  const besteVoorstelPerSchool = new Map<number, VoorstelBasis>();
  for (const voorstel of voorstellen) {
    if (voorstel.confidence !== "hoog" && voorstel.confidence !== "middel") continue;
    const huidig = besteVoorstelPerSchool.get(voorstel.schoolId);
    if (!huidig || voorstel.createdAt > huidig.createdAt) besteVoorstelPerSchool.set(voorstel.schoolId, voorstel);
  }

  const resultaat: Omit<WidgetSchoolItem, "contextTekst">[] = [];
  const gebruikt = new Set<number>();

  function voegToe(school: KandidaatSchool, tier: WidgetTier, reden: string) {
    if (gebruikt.has(school.id) || resultaat.length >= maxItems) return;
    gebruikt.add(school.id);
    resultaat.push({
      id: school.id,
      schoolName: school.schoolName,
      relatiestatus: school.relatiestatus,
      plaats: school.plaats,
      onderwijstype: school.onderwijstype,
      lastMondayActivityAt: school.lastMondayActivityAt,
      tier,
      reden,
    });
  }

  // Tier 1: open actie vandaag/achterstallig — Lead/Prospect/Wacht op
  // handtekening/Klant, gesorteerd op langst achterstallig eerst. Expliciete
  // statusfilter hier (niet alleen bij tier 2-4, en niet alleen vertrouwen
  // op de caller se query) — "Gestopt/Inactief nooit" is een harde eis,
  // deze functie moet 'm zelf afdwingen, ook als er ooit een andere
  // aanroeper met een bredere scholenlijst bijkomt.
  const tier1Kandidaten = [...laatsteOpenActiePerSchool.entries()]
    .map(([schoolId, actie]) => ({ school: scholenPerId.get(schoolId), actie }))
    .filter((k): k is { school: KandidaatSchool; actie: OpenActieBasis } => k.school !== undefined && WIDGET_TOEGESTANE_STATUSSEN.includes(k.school.relatiestatus ?? ""))
    .sort((a, b) => a.actie.dueDate.localeCompare(b.actie.dueDate));
  for (const { school, actie } of tier1Kandidaten) {
    if (resultaat.length >= maxItems) break;
    voegToe(school, 1, actie.dueDate.slice(0, 10) < vandaagIso ? "Actie achterstallig" : "Actie vandaag");
  }

  // Tier 2/3: pending AI-voorstel — uitsluitend actieve statussen (geen Klant).
  for (const confidenceTier of [{ waarde: "hoog" as const, tier: 2 as const, label: "AI-voorstel (hoog vertrouwen)" }, { waarde: "middel" as const, tier: 3 as const, label: "AI-voorstel (middel vertrouwen)" }]) {
    if (resultaat.length >= maxItems) break;
    const kandidaten = [...besteVoorstelPerSchool.entries()]
      .filter(([, v]) => v.confidence === confidenceTier.waarde)
      .map(([schoolId, voorstel]) => ({ school: scholenPerId.get(schoolId), voorstel }))
      .filter((k): k is { school: KandidaatSchool; voorstel: VoorstelBasis } => k.school !== undefined && ACTIEF_STATUSSEN.includes(k.school.relatiestatus ?? ""))
      .sort((a, b) => b.voorstel.createdAt.localeCompare(a.voorstel.createdAt));
    for (const { school } of kandidaten) {
      if (resultaat.length >= maxItems) break;
      voegToe(school, confidenceTier.tier, confidenceTier.label);
    }
  }

  // Tier 4: veiligheidsnet — actieve scholen ZONDER ENIGE open actie/voorstel
  // (ongeacht datum/vertrouwen — schoolIdsMetEnigeOpenActie/-Voorstel, niet
  // de tier1/2/3-specifieke, al-gefilterde maps hierboven), langst stil eerst.
  if (resultaat.length < maxItems) {
    const tier4Kandidaten = scholen
      .filter((s) => ACTIEF_STATUSSEN.includes(s.relatiestatus ?? "") && !gebruikt.has(s.id) && !schoolIdsMetEnigeOpenActie.has(s.id) && !schoolIdsMetEnigVoorstel.has(s.id))
      .sort((a, b) => (a.lastMondayActivityAt ?? "").localeCompare(b.lastMondayActivityAt ?? "")); // "" (nooit) sorteert als vroegst — hoogste prioriteit
    for (const school of tier4Kandidaten) {
      if (resultaat.length >= maxItems) break;
      voegToe(school, 4, "Geen vervolgactie gepland");
    }
  }

  return resultaat;
}

interface PayloadSchoolDoc {
  id: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
  onderwijstype: { id: number; name: string } | number | null;
  lastMondayActivityAt: string | null;
}

function idVan(waarde: number | { id: number }): number {
  return typeof waarde === "number" ? waarde : waarde.id;
}

/** Server-side orchestratie: haalt op, roept bepaalWidgetTiers aan, vult daarna alleen voor de uiteindelijk gekozen tier-4-scholen een contextzin uit het logboek (geen onnodige extra queries voor niet-gekozen kandidaten). */
export async function berekenSalesWidget(payload: Payload, maxItems = 5): Promise<WidgetSchoolItem[]> {
  const vandaagIso = new Date().toISOString().slice(0, 10);

  const [scholenResultaat, actiesResultaat, voorstellenResultaat] = await Promise.all([
    payload.find({
      collection: "sales-schools",
      where: { relatiestatus: { in: [...ACTIEF_STATUSSEN, KLANT] } },
      limit: 5000,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({ collection: "sales-actions", where: { status: { equals: "open" } }, limit: 5000, depth: 0, overrideAccess: true }),
    payload.find({
      collection: "sales-proposals",
      where: { status: { equals: "pending" }, proposalType: { in: PENDING_VOORSTEL_TYPES_VOOR_AANDACHT } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const scholen: KandidaatSchool[] = (scholenResultaat.docs as unknown as PayloadSchoolDoc[]).map((s) => ({
    id: s.id,
    schoolName: s.schoolName,
    relatiestatus: s.relatiestatus,
    plaats: s.plaats,
    onderwijstype: s.onderwijstype,
    lastMondayActivityAt: s.lastMondayActivityAt,
  }));
  const openActies: OpenActieBasis[] = (actiesResultaat.docs as unknown as { school: number | { id: number }; dueDate: string; description: string }[]).map((a) => ({
    schoolId: idVan(a.school),
    dueDate: a.dueDate,
    description: a.description,
  }));
  const voorstellen: VoorstelBasis[] = (
    voorstellenResultaat.docs as unknown as { school: number | { id: number }; confidence: "hoog" | "middel" | "laag" | null; reason: string | null; createdAt: string }[]
  ).map((p) => ({ schoolId: idVan(p.school), confidence: p.confidence, reason: p.reason, createdAt: p.createdAt }));

  const tiers = bepaalWidgetTiers(scholen, openActies, voorstellen, vandaagIso, maxItems);

  const actieOmschrijvingPerSchool = new Map(openActies.map((a) => [a.schoolId, a.description]));
  const voorstelRedenPerSchool = new Map(voorstellen.map((v) => [v.schoolId, v.reason]));

  const tier4SchoolIds = tiers.filter((t) => t.tier === 4).map((t) => t.id);
  const laatsteLogPerSchool = new Map<number, string>();
  if (tier4SchoolIds.length > 0) {
    const logResultaat = await payload.find({
      collection: "sales-log-events",
      where: { school: { in: tier4SchoolIds }, type: { equals: "contact" } },
      sort: "-occurredAt",
      limit: tier4SchoolIds.length * 3, // ruim genoeg om per school de meest recente te vinden, ook met wat gemigreerde ruis
      depth: 0,
      overrideAccess: true,
    });
    for (const doc of logResultaat.docs as unknown as { school: number | { id: number }; summary: string; payload?: { gemigreerd?: boolean } }[]) {
      if (doc.payload?.gemigreerd) continue; // veiligheidsnet-context toont bewust geen onbetrouwbare gemigreerde tekst
      const schoolId = idVan(doc.school);
      if (!laatsteLogPerSchool.has(schoolId)) laatsteLogPerSchool.set(schoolId, doc.summary);
    }
  }

  return tiers.map((item) => ({
    ...item,
    contextTekst: item.tier === 1 ? (actieOmschrijvingPerSchool.get(item.id) ?? null) : item.tier === 4 ? (laatsteLogPerSchool.get(item.id) ?? null) : (voorstelRedenPerSchool.get(item.id) ?? null),
  }));
}
