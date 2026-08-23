import {
  del,
  issueSignedToken,
  presignUrl,
  put,
  BlobError,
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobPathnameMismatchError,
  BlobClientTokenExpiredError,
  BlobFileTooLargeError,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  BlobNotFoundError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobRequestAbortedError,
  BlobPreconditionFailedError,
} from "@vercel/blob";
import { optionalEnv } from "@/config/env";

// Privé bijlage-opslag voor het contactformulier — zie
// docs/SECURITY-AND-PRIVACY.md §Opslag & toegang bijlagen. Gebruikt Vercel
// Blob's private storage + kortlevende signed URL's rechtstreeks via de
// @vercel/blob-SDK (bewust NIET via Payload's upload-collection-mechanisme —
// zie payload/collections/ContactSubmissions.ts voor de motivatie: Payload's
// vercelBlobStorage-plugin ondersteunt op dit moment alleen 'public'-toegang).
//
// Authenticatie: @vercel/blob (2.6.1+) ondersteunt naast een los
// BLOB_READ_WRITE_TOKEN ook Vercel's OIDC-koppeling — wanneer de Blob store
// via het Vercel-project is gekoppeld, injecteert Vercel zelf BLOB_STORE_ID
// en (tijdens runtime) VERCEL_OIDC_TOKEN, en herkent de SDK dit automatisch
// zodra er géén `token`-optie wordt meegegeven. We geven dus alleen expliciet
// een token mee wanneer BLOB_READ_WRITE_TOKEN daadwerkelijk gezet is (bv.
// lokale ontwikkeling); anders laten we de SDK's eigen omgevingsresolutie
// (env BLOB_READ_WRITE_TOKEN, anders OIDC) haar werk doen. Geen fallback naar
// minder veilige opslag: zonder geldige auth (token óf OIDC) faalt de
// aanroep gewoon met een duidelijke fout van de SDK zelf.

export interface GeuploadBestand {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** De (private, niet rechtstreeks fetch()-bare) Blob-URL — nodig om op een Payload-document te zetten, zie uploadDownloadBestand. */
  url: string;
}

const ATTACHMENT_PREFIX = "contact-attachments";
// Downloadbeheer (2026-07-29): eigen prefix voor PDF's die beheerders direct
// uploaden/vervangen vanuit Downloadbeheer — los van contact-attachments,
// zelfde opslagmodel. Zie app/api/knowledge-sources/upload-file/route.ts.
const DOWNLOAD_PREFIX = "downloads";
// Uniforme private-uploadarchitectuur (2026-07-31): eigen prefix voor alles
// wat via de gewone Payload Media-collectie binnenkomt (variantlogo's,
// Handleidingbouwer-screenshots, losse media-uploads) — zie
// lib/media/private-blob-adapter.ts. Los van downloads/contact-attachments
// zodat elke categorie zijn eigen, nooit-overlappende naamruimte houdt.
const MEDIA_PREFIX = "media";
// Traineromgeving V2, Fase 3 (2026-08-23) — Bestanden + Deelgroepen: eigen
// prefix voor schoolbestanden én algemene trainerbestanden (samen, want ze
// delen hetzelfde opslagmodel — zie payload/collections/TrainerBestanden.ts
// voor de scope-discriminator). Los van MEDIA_PREFIX: dit loopt niet via de
// Payload Media-collectie/cloud-storage-plugin, maar rechtstreeks via
// lib/trainers/bestanden.ts, zelfde patroon als DOWNLOAD_PREFIX hierboven.
const TRAINER_BESTANDEN_PREFIX = "trainer-bestanden";
const DOWNLOAD_URL_GELDIGHEID_MS = 5 * 60 * 1000; // 5 minuten

/**
 * Alleen een `token`-property wanneer die expliciet gezet is — anders leeg
 * object, zodat de SDK's eigen (OIDC-)resolutie geldt. Geëxporteerd zodat
 * lib/knowledge/manuals-blob.ts (Sprint 6, handleidingen-opslag) dezelfde
 * auth-resolutie hergebruikt i.p.v. een tweede kopie te onderhouden.
 */
export function blobAuthOptions(): { token: string } | Record<string, never> {
  const token = optionalEnv("BLOB_READ_WRITE_TOKEN");
  return token ? { token } : {};
}

/**
 * Gedeelde private-upload-logica — één beveiligingsmodel voor alles wat via
 * deze module wordt opgeslagen (contactbijlagen, downloadbeheer-PDF's,
 * gewone media-uploads, ...), uitsluitend van elkaar onderscheiden door de
 * prefix. Neemt bewust een kale buffer + metadata aan (niet een `File`):
 * de Payload-uploadadapter (lib/media/private-blob-adapter.ts) krijgt van
 * Payload zelf al een losse Buffer, geen File-object — een tweede
 * conversiepad daarvoor zou deze functie juist minder generiek maken. De
 * bestaande `File`-aanroepers (formulier-uploads) zetten hun File hieronder
 * zelf om, één keer, in hun eigen wrapper. Nooit rechtstreeks exporteren:
 * elke aanroeper krijgt een eigen, benoemde functie, zodat een prefix nooit
 * per ongeluk verward kan worden.
 */
async function uploadNaarPrivateBlob(
  buffer: Buffer,
  opties: { filename: string; mimeType: string; sizeBytes: number; prefix: string }
): Promise<GeuploadBestand> {
  const storageKey = `${opties.prefix}/${crypto.randomUUID()}-${opties.filename}`;

  const resultaat = await put(storageKey, buffer, {
    access: "private",
    ...blobAuthOptions(),
    addRandomSuffix: false,
    contentType: opties.mimeType || "application/octet-stream",
  });

  return {
    storageKey,
    filename: opties.filename,
    mimeType: opties.mimeType,
    sizeBytes: opties.sizeBytes,
    url: resultaat.url,
  };
}

export async function uploadBijlage(bestand: File): Promise<GeuploadBestand> {
  const buffer = Buffer.from(await bestand.arrayBuffer());
  return uploadNaarPrivateBlob(buffer, {
    filename: bestand.name,
    mimeType: bestand.type || "application/octet-stream",
    sizeBytes: bestand.size,
    prefix: ATTACHMENT_PREFIX,
  });
}

/**
 * Downloadbeheer (2026-07-29): PDF's die beheerders direct uploaden/
 * vervangen — zie app/api/knowledge-sources/upload-file/route.ts. Bewust
 * NIET via de vercelBlobStorage-plugin (payload.config.ts): die ondersteunt
 * alleen 'public'-toegang, terwijl de productie-Blob-store private is (zie
 * de uitgebreide analyse in de route zelf). Zelfde rechtstreekse
 * @vercel/blob-aanpak als lib/knowledge/sync-manuals.ts al gebruikt voor
 * handleidingen — de resulterende `url` wordt handmatig op een Media-
 * document gezet (`filesRequiredOnCreate: false` in Media.ts bestaat al
 * precies hiervoor); het bestaande `resolveerBestandsUrl()` (lib/knowledge/
 * process-source.ts) herkent zo'n private Blob-URL automatisch en genereert
 * er pas bij een daadwerkelijke download een kortlevende signed URL voor.
 */
export async function uploadDownloadBestand(bestand: File): Promise<GeuploadBestand> {
  const buffer = Buffer.from(await bestand.arrayBuffer());
  return uploadNaarPrivateBlob(buffer, {
    filename: bestand.name,
    mimeType: bestand.type || "application/octet-stream",
    sizeBytes: bestand.size,
    prefix: DOWNLOAD_PREFIX,
  });
}

/**
 * Uniforme private-uploadarchitectuur (2026-07-31): door de gewone Payload
 * Media-collectie zelf aangeroepen (lib/media/private-blob-adapter.ts) —
 * variantlogo's, Handleidingbouwer-screenshots, en elk toekomstig
 * uploadveld dat naar "media" verwijst. Payload geeft hier al een losse
 * Buffer (uit req.file, vóór Payload's eigen — op Vercel niet-werkende —
 * lokale schijfschrijfstap), vandaar de buffer-variant hieronder i.p.v. een
 * `File`-object.
 */
export async function uploadMediaBestand(
  buffer: Buffer,
  opties: { filename: string; mimeType: string }
): Promise<GeuploadBestand> {
  return uploadNaarPrivateBlob(buffer, {
    filename: opties.filename,
    mimeType: opties.mimeType,
    sizeBytes: buffer.byteLength,
    prefix: MEDIA_PREFIX,
  });
}

/**
 * Traineromgeving V2, Fase 3 (2026-08-23) — schoolbestanden én algemene
 * trainerbestanden, beide via deze ENE functie (het onderscheid leeft
 * uitsluitend in payload/collections/TrainerBestanden.ts se `scope`-veld,
 * niet in de opslaglaag). Buffer-variant, zelfde reden als
 * uploadMediaBestand hierboven: lib/trainers/bestanden.ts se
 * maakSchoolBestand/maakAlgemeenBestand nemen zelf al een kale
 * buffer+metadata aan (i.p.v. een `File`) zodat die functies zonder
 * File/FormData-gedoe unit-testbaar blijven — de aanroepende route zet de
 * echte, uit request.formData() gelezen File daar zelf één keer voor om.
 */
export async function uploadTrainerBestand(
  buffer: Buffer,
  opties: { filename: string; mimeType: string }
): Promise<GeuploadBestand> {
  return uploadNaarPrivateBlob(buffer, {
    filename: opties.filename,
    mimeType: opties.mimeType,
    sizeBytes: buffer.byteLength,
    prefix: TRAINER_BESTANDEN_PREFIX,
  });
}

/**
 * Veilige, categorie-only foutclassificatie voor server-side logging —
 * Productiecontrole (2026-08-23): een downloadfout moet diagnosticeerbaar
 * zijn zonder ooit een token, signed URL, bestandsinhoud of persoonsgegeven
 * te loggen. Elke @vercel/blob-foutklasse heeft een vaste, generieke
 * message (geverifieerd in node_modules/@vercel/blob/dist/chunk-*.js —
 * bv. BlobAccessError = altijd "Access denied, please provide a valid
 * token..."), maar we loggen zelfs die message niet: uitsluitend welke
 * klasse het was, plus een grove statuscategorie.
 */
export type BlobFoutStatusCategorie = "4xx" | "5xx" | "onbekend";

export function classificeerBlobFout(error: unknown): { categorie: string; statusCategorie: BlobFoutStatusCategorie } {
  if (error instanceof BlobStoreNotFoundError) return { categorie: "blob_store_not_found", statusCategorie: "4xx" };
  if (error instanceof BlobStoreSuspendedError) return { categorie: "blob_store_suspended", statusCategorie: "4xx" };
  if (error instanceof BlobAccessError) return { categorie: "blob_access_denied", statusCategorie: "4xx" };
  if (error instanceof BlobNotFoundError) return { categorie: "blob_not_found", statusCategorie: "4xx" };
  if (error instanceof BlobClientTokenExpiredError) return { categorie: "blob_token_expired", statusCategorie: "4xx" };
  if (error instanceof BlobPathnameMismatchError) return { categorie: "blob_pathname_mismatch", statusCategorie: "4xx" };
  if (error instanceof BlobContentTypeNotAllowedError) return { categorie: "blob_content_type_not_allowed", statusCategorie: "4xx" };
  if (error instanceof BlobFileTooLargeError) return { categorie: "blob_file_too_large", statusCategorie: "4xx" };
  if (error instanceof BlobPreconditionFailedError) return { categorie: "blob_precondition_failed", statusCategorie: "4xx" };
  if (error instanceof BlobServiceRateLimited) return { categorie: "blob_rate_limited", statusCategorie: "4xx" };
  if (error instanceof BlobServiceNotAvailable) return { categorie: "blob_service_unavailable", statusCategorie: "5xx" };
  if (error instanceof BlobRequestAbortedError) return { categorie: "blob_request_aborted", statusCategorie: "onbekend" };
  if (error instanceof BlobUnknownError) return { categorie: "blob_unknown", statusCategorie: "onbekend" };
  if (error instanceof BlobError) return { categorie: "blob_error_overig", statusCategorie: "onbekend" };
  return { categorie: "onbekende_fout", statusCategorie: "onbekend" };
}

/**
 * Signaleert PRECIES welke van de twee stappen mislukte (issueSignedToken
 * versus presignUrl) — Productiecontrole (2026-08-23), diagnosevereiste
 * "stap/categorie". Draagt bewust geen `cause`/onderliggende foutmelding:
 * de classificatie hierboven is al het volledige, veilig te loggen signaal.
 */
export class DownloadUrlFout extends Error {
  constructor(
    public readonly stap: "signed_token" | "presign",
    public readonly categorie: string,
    public readonly statusCategorie: BlobFoutStatusCategorie
  ) {
    super(`Download-URL genereren mislukt bij stap "${stap}" (${categorie}).`);
    this.name = "DownloadUrlFout";
  }
}

/** Kortlevende signed download-URL — pas genereren op het moment dat een melding daadwerkelijk geopend wordt. */
export async function genereerDownloadUrl(storageKey: string): Promise<string> {
  let signedToken: Awaited<ReturnType<typeof issueSignedToken>>;
  try {
    signedToken = await issueSignedToken({
      pathname: storageKey,
      operations: ["get"],
      validUntil: Date.now() + DOWNLOAD_URL_GELDIGHEID_MS,
      ...blobAuthOptions(),
    });
  } catch (error) {
    const { categorie, statusCategorie } = classificeerBlobFout(error);
    throw new DownloadUrlFout("signed_token", categorie, statusCategorie);
  }

  try {
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname: storageKey,
      access: "private",
      validUntil: Date.now() + DOWNLOAD_URL_GELDIGHEID_MS,
    });
    return presignedUrl;
  } catch (error) {
    const { categorie, statusCategorie } = classificeerBlobFout(error);
    throw new DownloadUrlFout("presign", categorie, statusCategorie);
  }
}

/** Verwijdert een bijlage direct en definitief — gebruikt bij bewaartermijn-verval en "verwijderen op verzoek". */
export async function verwijderBijlage(storageKey: string): Promise<void> {
  await del(storageKey, { ...blobAuthOptions() });
}
