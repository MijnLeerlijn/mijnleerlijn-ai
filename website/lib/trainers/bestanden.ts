import type { Payload } from "payload";
import { haalSchoolDetail, haalTrainingVoorMutatie, bepaalScholenVoorTrainer } from "./monday-links";
import { haalActieveGroepenVoorTrainer, type TrainerDeelgroepSamenvatting } from "./groepen";
import { uploadTrainerBestand, genereerDownloadUrl, DownloadUrlFout } from "@/services/storage";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 3 (2026-08-23) — Bestanden + Deelgroepen. Eén
// module voor beide scopes (school/algemeen) — zelfde reden als het
// eengemaakte datamodel (TrainerBestanden.ts): upload/lees/download/
// verwijderlogica is voor beide vrijwel identiek, alleen de
// eigendoms-/zichtbaarheidsregel verschilt. Dit bestand is de ENIGE plek die
// "trainer-bestanden" muteert (collectie se access-blok staat create/update
// nergens anders toe) — elke aanroep gebruikt bewust overrideAccess: true,
// nooit de publieke Payload-API. Zelfde eigendomsverificatiepatroon als
// lib/trainers/logboek.ts/verslag.ts: school (en, indien opgegeven, training)
// worden bij ELKE aanroep opnieuw live tegen Monday geverifieerd via
// haalSchoolDetail/haalTrainingVoorMutatie/bepaalScholenVoorTrainer — nooit
// een client-aangeleverde schoolnaam/-id vertrouwen. `trainer` komt hier
// ALTIJD uit het server-geverifieerde sessietrainer-object.

export const MAX_BESTANDSGROOTTE = 25 * 1024 * 1024; // 25MB — zelfde grens als de al bestaande, bewezen Downloadbeheer-PDF-upload (app/api/knowledge-sources/upload-file/route.ts).

// Allowlist (nooit een blocklist): een bestandstype dat hier niet expliciet
// in staat, wordt geweigerd — .exe/scripts/overige binaries zijn dus
// automatisch onmogelijk, zonder dat daar een aparte controle voor nodig is
// (opdrachtseis §6). Extensie én MIME worden gekoppeld gecontroleerd (niet
// los van elkaar): een bestand met een ".pdf"-naam maar een
// "image/png"-MIME-type wordt geweigerd — vertrouwt dus nooit uitsluitend op
// de extensie, zoals expliciet gevraagd.
const BESTANDSTYPEN: { extensies: string[]; mimeTypes: string[] }[] = [
  { extensies: [".pdf"], mimeTypes: ["application/pdf"] },
  { extensies: [".ppt"], mimeTypes: ["application/vnd.ms-powerpoint"] },
  { extensies: [".pptx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"] },
  { extensies: [".doc"], mimeTypes: ["application/msword"] },
  { extensies: [".docx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  { extensies: [".xls"], mimeTypes: ["application/vnd.ms-excel"] },
  { extensies: [".xlsx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
  // CSV heeft in de praktijk geen uniform MIME-type over browsers/OS'en —
  // "text/csv" is de standaard, "application/vnd.ms-excel"/"text/plain" komen
  // voor bij Excel-geëxporteerde/kaal-getypeerde CSV's. Alle drie toegestaan,
  // uitsluitend gekoppeld aan de ".csv"-extensie (nooit los).
  { extensies: [".csv"], mimeTypes: ["text/csv", "application/vnd.ms-excel", "text/plain"] },
  { extensies: [".png"], mimeTypes: ["image/png"] },
  { extensies: [".jpg", ".jpeg"], mimeTypes: ["image/jpeg"] },
];

export function bestandsextensie(filename: string): string {
  const laatstePunt = filename.lastIndexOf(".");
  return laatstePunt === -1 ? "" : filename.slice(laatstePunt).toLowerCase();
}

export function valideerBestandstype(filename: string, mimeType: string): boolean {
  const extensie = bestandsextensie(filename);
  const regel = BESTANDSTYPEN.find((r) => r.extensies.includes(extensie));
  return Boolean(regel && regel.mimeTypes.includes(mimeType));
}

export const CATEGORIE_OPTIES = ["curriculum", "presentatie", "trainingsmateriaal", "werkdocument", "export", "schooldocument", "overig"] as const;
export type BestandCategorie = (typeof CATEGORIE_OPTIES)[number];

export const CATEGORIE_LABEL: Record<BestandCategorie, string> = {
  curriculum: "Curriculum",
  presentatie: "Presentatie",
  trainingsmateriaal: "Trainingsmateriaal",
  werkdocument: "Werkdocument",
  export: "Export",
  schooldocument: "Schooldocument",
  overig: "Overig",
};

export type BestandZichtbaarheid = "prive" | "gedeeld";

export interface TrainerBestandRecord {
  id: number;
  scope: "school" | "trainer";
  titel: string;
  categorie: BestandCategorie;
  omschrijving?: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: number;
  uploaderNaam: string;
  mondaySchoolId?: string | null;
  schoolNaam?: string | null;
  mondayTrainingId?: string | null;
  trainingNaam?: string | null;
  zichtbaarheid?: BestandZichtbaarheid | null;
  deelgroepen: TrainerDeelgroepSamenvatting[];
  createdAt: string;
}

/** Ruwe vorm zoals een payload.find/findByID-aanroep met depth:1 teruggeeft — bewust een eigen, beperkte vorm i.p.v. het volledige gegenereerde type, zelfde precedent als VerslagRecord/LogboekItemRecord. */
interface RuweBestandDoc {
  id: number;
  scope: "school" | "trainer";
  titel: string;
  categorie: BestandCategorie;
  omschrijving?: string | null;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploader: number | { id: number; name?: string | null };
  mondaySchoolId?: string | null;
  schoolNaam?: string | null;
  mondayTrainingId?: string | null;
  trainingNaam?: string | null;
  zichtbaarheid?: BestandZichtbaarheid | null;
  deelgroepen?: (number | { id: number; naam?: string | null })[] | null;
  createdAt: string;
}

function naarRecord(doc: RuweBestandDoc): TrainerBestandRecord {
  const uploaderId = typeof doc.uploader === "object" ? doc.uploader.id : doc.uploader;
  const uploaderNaam = (typeof doc.uploader === "object" ? doc.uploader.name : null) ?? "Onbekende trainer";
  const deelgroepen: TrainerDeelgroepSamenvatting[] = (doc.deelgroepen ?? []).map((g) =>
    typeof g === "object" ? { id: g.id, naam: g.naam ?? "Onbekende groep" } : { id: g, naam: "Onbekende groep" }
  );
  return {
    id: doc.id,
    scope: doc.scope,
    titel: doc.titel,
    categorie: doc.categorie,
    omschrijving: doc.omschrijving,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    uploaderId,
    uploaderNaam,
    mondaySchoolId: doc.mondaySchoolId,
    schoolNaam: doc.schoolNaam,
    mondayTrainingId: doc.mondayTrainingId,
    trainingNaam: doc.trainingNaam,
    zichtbaarheid: doc.zichtbaarheid,
    deelgroepen,
    createdAt: doc.createdAt,
  };
}

/** Kale buffer+metadata i.p.v. een `File` — bewuste keuze, zie het commentaar bij uploadTrainerBestand (services/storage.ts): houdt dit bestand zonder File/FormData-gedoe unit-testbaar. De aanroepende route zet de echte, uit request.formData() gelezen File hier zelf één keer voor om. */
export interface RuwOpTeSlaanBestand {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Haalt een bestandsveld uit FormData — bewust GEEN `instanceof File`: in de
 * testomgeving (jsdom) is `File` een andere klasse dan de File-implementatie
 * die NextRequest.formData() zelf intern gebruikt, dus cross-realm
 * `instanceof` faalt daar altijd. Duck-typing werkt in beide gevallen én in
 * productie — zelfde bewezen patroon als app/api/knowledge-sources/
 * upload-file/route.ts en app/api/contact/route.ts, hier één keer gedeeld
 * omdat dit bestand zelf twee eigen uploadroutes bedient.
 */
export function haalFileUitFormData(form: FormData, veldnaam: string): File | null {
  const ruw = form.get(veldnaam);
  const isBestand = ruw !== null && typeof ruw === "object" && typeof (ruw as Blob).arrayBuffer === "function" && typeof (ruw as File).name === "string";
  return isBestand ? (ruw as File) : null;
}

export async function naarRuwOpTeSlaanBestand(bestand: File): Promise<RuwOpTeSlaanBestand> {
  const buffer = Buffer.from(await bestand.arrayBuffer());
  return { buffer, filename: bestand.name, mimeType: bestand.type || "application/octet-stream", size: bestand.size };
}

export type MaakBestandUitkomst =
  | { soort: "niet_gevonden" } // school (of, indien opgegeven, training) hoort niet bij deze trainer
  | { soort: "ongeldige_invoer"; boodschap: string }
  | { soort: "ok"; bestand: TrainerBestandRecord };

function valideerBasis(titel: string, categorie: string, bestand: RuwOpTeSlaanBestand): string | null {
  if (!titel.trim()) return "Vul een titel in.";
  if (!(CATEGORIE_OPTIES as readonly string[]).includes(categorie)) return "Kies een geldige categorie.";
  if (bestand.size === 0) return "Bestand is leeg.";
  if (bestand.size > MAX_BESTANDSGROOTTE) return "Bestand is te groot (max. 25MB).";
  if (!valideerBestandstype(bestand.filename, bestand.mimeType)) return "Dit bestandstype wordt niet ondersteund.";
  return null;
}

export interface SchoolBestandInvoer {
  mondaySchoolId: string;
  titel: string;
  categorie: BestandCategorie | string;
  omschrijving?: string;
  mondayTrainingId?: string;
  bestand: RuwOpTeSlaanBestand;
}

/**
 * Schoolbestand — spec §1/§9: school komt uitsluitend van de pagina (server-
 * side, nooit clientinvoer), training is optioneel en wordt bij opgave apart
 * geverifieerd (moet daadwerkelijk bij DEZE school horen).
 */
export async function maakSchoolBestand(payload: Payload, trainer: AuthTrainer, invoer: SchoolBestandInvoer): Promise<MaakBestandUitkomst> {
  const foutmelding = valideerBasis(invoer.titel, invoer.categorie, invoer.bestand);
  if (foutmelding) return { soort: "ongeldige_invoer", boodschap: foutmelding };

  const school = await haalSchoolDetail(trainer, invoer.mondaySchoolId);
  if (!school) return { soort: "niet_gevonden" };

  let trainingNaam: string | undefined;
  if (invoer.mondayTrainingId) {
    const gevonden = await haalTrainingVoorMutatie(trainer, invoer.mondayTrainingId);
    if (!gevonden || gevonden.schoolId !== invoer.mondaySchoolId) return { soort: "niet_gevonden" };
    trainingNaam = gevonden.training.naam;
  }

  const geupload = await uploadTrainerBestand(invoer.bestand.buffer, { filename: invoer.bestand.filename, mimeType: invoer.bestand.mimeType });

  const nieuw = await payload.create({
    collection: "trainer-bestanden",
    overrideAccess: true,
    data: {
      scope: "school",
      titel: invoer.titel.trim(),
      categorie: invoer.categorie as BestandCategorie,
      omschrijving: invoer.omschrijving?.trim() || null,
      storageKey: geupload.storageKey,
      filename: geupload.filename,
      mimeType: geupload.mimeType,
      sizeBytes: geupload.sizeBytes,
      uploader: trainer.id,
      mondaySchoolId: invoer.mondaySchoolId,
      schoolNaam: school.naam,
      mondayTrainingId: invoer.mondayTrainingId ?? null,
      trainingNaam: trainingNaam ?? null,
    },
    depth: 1,
  });
  return { soort: "ok", bestand: naarRecord(nieuw as unknown as RuweBestandDoc) };
}

export interface AlgemeenBestandInvoer {
  titel: string;
  categorie: BestandCategorie | string;
  omschrijving?: string;
  zichtbaarheid: BestandZichtbaarheid | string;
  deelgroepIds?: number[];
  bestand: RuwOpTeSlaanBestand;
}

/**
 * Algemeen trainerbestand — spec §4: een trainer mag NOOIT delen met een
 * groep waarvan hij geen lid is. Elke opgegeven deelgroep wordt daarom
 * herverifieerd tegen haalActieveGroepenVoorTrainer (dezelfde functie die de
 * upload-dropdown vult) — nooit de client-aangeleverde groeps-ID's blind
 * vertrouwen. Bij "Alleen voor mij" worden eventueel toch meegegeven
 * deelgroepen genegeerd (nooit per ongeluk delen).
 */
export async function maakAlgemeenBestand(payload: Payload, trainer: AuthTrainer, invoer: AlgemeenBestandInvoer): Promise<MaakBestandUitkomst> {
  const foutmelding = valideerBasis(invoer.titel, invoer.categorie, invoer.bestand);
  if (foutmelding) return { soort: "ongeldige_invoer", boodschap: foutmelding };
  if (invoer.zichtbaarheid !== "prive" && invoer.zichtbaarheid !== "gedeeld") {
    return { soort: "ongeldige_invoer", boodschap: "Kies een geldige zichtbaarheid." };
  }

  let deelgroepen: number[] = [];
  if (invoer.zichtbaarheid === "gedeeld") {
    const gewenst = invoer.deelgroepIds ?? [];
    if (gewenst.length === 0) return { soort: "ongeldige_invoer", boodschap: "Kies minstens één groep om mee te delen." };
    const eigenGroepen = await haalActieveGroepenVoorTrainer(payload, trainer);
    const eigenIds = new Set(eigenGroepen.map((g) => g.id));
    if (!gewenst.every((id) => eigenIds.has(id))) {
      return { soort: "ongeldige_invoer", boodschap: "Je kunt alleen delen met groepen waar je zelf lid van bent." };
    }
    deelgroepen = gewenst;
  }

  const geupload = await uploadTrainerBestand(invoer.bestand.buffer, { filename: invoer.bestand.filename, mimeType: invoer.bestand.mimeType });

  const nieuw = await payload.create({
    collection: "trainer-bestanden",
    overrideAccess: true,
    data: {
      scope: "trainer",
      titel: invoer.titel.trim(),
      categorie: invoer.categorie as BestandCategorie,
      omschrijving: invoer.omschrijving?.trim() || null,
      storageKey: geupload.storageKey,
      filename: geupload.filename,
      mimeType: geupload.mimeType,
      sizeBytes: geupload.sizeBytes,
      uploader: trainer.id,
      zichtbaarheid: invoer.zichtbaarheid,
      deelgroepen,
    },
    depth: 1,
  });
  return { soort: "ok", bestand: naarRecord(nieuw as unknown as RuweBestandDoc) };
}

/** Alle algemene bestanden die déze trainer zelf uploadde — ongeacht zichtbaarheid (hij is eigenaar, ziet dus altijd alles van zichzelf). */
export async function haalMijnBestanden(payload: Payload, trainer: AuthTrainer): Promise<TrainerBestandRecord[]> {
  const resultaat = await payload.find({
    collection: "trainer-bestanden",
    where: { and: [{ scope: { equals: "trainer" } }, { uploader: { equals: trainer.id } }] },
    overrideAccess: true,
    depth: 1,
    sort: "-createdAt",
    limit: 200,
  });
  return resultaat.docs.map((doc) => naarRecord(doc as unknown as RuweBestandDoc));
}

export interface GedeeldBestandRecord extends TrainerBestandRecord {
  /** Van de groepen op het bestand: uitsluitend degene waar DEZE trainer zelf lid van is (een bestand kan met meerdere groepen gedeeld zijn; niet elke kijker zit in elke groep). */
  gedeeldViaGroepen: TrainerDeelgroepSamenvatting[];
}

/** Algemene bestanden die via één of meer groepen van déze trainer gedeeld zijn — nooit zijn eigen uploads (die staan al onder "Mijn bestanden"). Live query op huidig lidmaatschap, geen cache/kopie (opdrachtseis §4). */
export async function haalMetMijGedeeldeBestanden(payload: Payload, trainer: AuthTrainer): Promise<GedeeldBestandRecord[]> {
  const eigenGroepen = await haalActieveGroepenVoorTrainer(payload, trainer);
  if (eigenGroepen.length === 0) return [];
  const eigenIds = new Set(eigenGroepen.map((g) => g.id));

  // "deelgroepen bevat minstens één van mijn groepen" is geen enkele-veld-
  // where-conditie (deelgroepen is zelf een hasMany-veld) — de brede
  // scope/zichtbaarheid-filtering gebeurt hier al server-side (al een klein
  // resultaat op deze schaal), de groepsintersectie + zelf-uitsluiting
  // erna in het geheugen, zelfde stijl als elders in dit project waar een
  // where-conditie te specifiek zou worden voor de winst die het oplevert.
  const resultaat = await payload.find({
    collection: "trainer-bestanden",
    where: { and: [{ scope: { equals: "trainer" } }, { zichtbaarheid: { equals: "gedeeld" } }] },
    overrideAccess: true,
    depth: 1,
    sort: "-createdAt",
    limit: 200,
  });

  return resultaat.docs
    .map((doc) => naarRecord(doc as unknown as RuweBestandDoc))
    .filter((record) => record.uploaderId !== trainer.id)
    .map((record) => ({ ...record, gedeeldViaGroepen: record.deelgroepen.filter((g) => eigenIds.has(g.id)) }))
    .filter((record) => record.gedeeldViaGroepen.length > 0);
}

/** Alle schoolbestanden van één school — null als deze trainer niet (meer) aan die school gekoppeld is (zelfde live-scoping-bron als de rest van de trainerportal, haalSchoolDetail). */
export async function haalSchoolBestanden(payload: Payload, trainer: AuthTrainer, mondaySchoolId: string): Promise<TrainerBestandRecord[] | null> {
  const school = await haalSchoolDetail(trainer, mondaySchoolId);
  if (!school) return null;

  const resultaat = await payload.find({
    collection: "trainer-bestanden",
    where: { and: [{ scope: { equals: "school" } }, { mondaySchoolId: { equals: mondaySchoolId } }] },
    overrideAccess: true,
    depth: 1,
    sort: "-createdAt",
    limit: 200,
  });
  return resultaat.docs.map((doc) => naarRecord(doc as unknown as RuweBestandDoc));
}

async function haalBestand(payload: Payload, bestandId: number): Promise<TrainerBestandRecord | null> {
  const doc = await payload.findByID({ collection: "trainer-bestanden", id: bestandId, overrideAccess: true, depth: 1 }).catch(() => null);
  return doc ? naarRecord(doc as unknown as RuweBestandDoc) : null;
}

/**
 * Centrale autorisatie — spec §13: "bij elke download opnieuw controleren."
 * Nooit een resultaat cachen/onthouden: elke aanroep query't live.
 */
export async function magTrainerBestandZien(payload: Payload, trainer: AuthTrainer, bestand: TrainerBestandRecord): Promise<boolean> {
  if (bestand.uploaderId === trainer.id) return true;
  if (bestand.scope === "school") {
    if (!bestand.mondaySchoolId) return false;
    const { bevestigd } = await bepaalScholenVoorTrainer(trainer);
    return bevestigd.some((s) => s.id === bestand.mondaySchoolId);
  }
  if (bestand.zichtbaarheid === "gedeeld" && bestand.deelgroepen.length > 0) {
    const eigenGroepen = await haalActieveGroepenVoorTrainer(payload, trainer);
    const eigenIds = new Set(eigenGroepen.map((g) => g.id));
    return bestand.deelgroepen.some((g) => eigenIds.has(g.id));
  }
  return false;
}

export type DownloadUitkomst =
  | { soort: "niet_gevonden" }
  | { soort: "geen_toegang" }
  | { soort: "fout" }
  | { soort: "ok"; url: string; bestand: TrainerBestandRecord };

export type AdminDownloadUitkomst = { soort: "niet_gevonden" } | { soort: "fout" } | { soort: "ok"; url: string };

/**
 * Productiecontrole (2026-08-23) — veilige diagnostiek bij een mislukte
 * download: uitsluitend bestandId, welke route (trainer/admin), en (bij een
 * Blob-fout) stap+categorie+statuscategorie. Nooit een token, signed URL,
 * bestandsinhoud of persoonsgegeven — zie DownloadUrlFout/classificeerBlobFout
 * (services/storage.ts) voor de classificatie zelf.
 */
function loggeDownloadFout(bestandId: number, route: "trainer" | "admin", error: unknown): void {
  const details =
    error instanceof DownloadUrlFout
      ? { stap: error.stap, categorie: error.categorie, statusCategorie: error.statusCategorie }
      : { stap: "onbekend", categorie: "onbekende_fout", statusCategorie: "onbekend" };
  console.error("[trainer-bestanden] Download mislukt:", { bestandId, route, ...details });
}

export async function genereerTrainerBestandDownloadUrl(payload: Payload, trainer: AuthTrainer, bestandId: number): Promise<DownloadUitkomst> {
  const bestand = await haalBestand(payload, bestandId);
  if (!bestand) return { soort: "niet_gevonden" };
  const magZien = await magTrainerBestandZien(payload, trainer, bestand);
  if (!magZien) return { soort: "geen_toegang" }; // route.ts geeft hiervoor bewust ook 404 terug — anti-enumeratie, zelfde patroon als elders

  try {
    const doc = await payload.findByID({ collection: "trainer-bestanden", id: bestandId, overrideAccess: true, depth: 0 });
    const url = await genereerDownloadUrl(doc.storageKey as string);
    return { soort: "ok", url, bestand };
  } catch (error) {
    loggeDownloadFout(bestandId, "trainer", error);
    return { soort: "fout" };
  }
}

/** Admin-variant — geen trainer-scoping-check, de aanroepende route heeft de admin-sessie zelf al geverifieerd (isEditor/isAdmin). */
export async function genereerBestandDownloadUrlAlsAdmin(payload: Payload, bestandId: number): Promise<AdminDownloadUitkomst> {
  const doc = await payload.findByID({ collection: "trainer-bestanden", id: bestandId, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!doc) return { soort: "niet_gevonden" };
  try {
    const url = await genereerDownloadUrl(doc.storageKey as string);
    return { soort: "ok", url };
  } catch (error) {
    loggeDownloadFout(bestandId, "admin", error);
    return { soort: "fout" };
  }
}

/**
 * Verwijderen — spec §7: eigen algemene bestanden altijd, eigen
 * schoolbestanden alleen zolang nog gekoppeld aan die school. Nooit
 * andermans bestand, nooit alleen-omdat-gedeeld (groepslidmaatschap geeft
 * uitsluitend leesrecht, geen verwijderrecht).
 */
export async function magTrainerBestandVerwijderen(trainer: AuthTrainer, bestand: TrainerBestandRecord): Promise<boolean> {
  if (bestand.uploaderId !== trainer.id) return false;
  if (bestand.scope === "school") {
    if (!bestand.mondaySchoolId) return false;
    const { bevestigd } = await bepaalScholenVoorTrainer(trainer);
    return bevestigd.some((s) => s.id === bestand.mondaySchoolId);
  }
  return true;
}

export type VerwijderUitkomst = "ok" | "niet_gevonden" | "geen_toegang";

export async function verwijderTrainerBestand(payload: Payload, trainer: AuthTrainer, bestandId: number): Promise<VerwijderUitkomst> {
  const bestand = await haalBestand(payload, bestandId);
  if (!bestand) return "niet_gevonden";
  const magVerwijderen = await magTrainerBestandVerwijderen(trainer, bestand);
  if (!magVerwijderen) return "geen_toegang";

  // De collectie se afterDelete-hook (TrainerBestanden.ts) ruimt de
  // daadwerkelijke Blob op — hier alleen het Payload-record verwijderen.
  await payload.delete({ collection: "trainer-bestanden", id: bestandId, overrideAccess: true });
  return "ok";
}
