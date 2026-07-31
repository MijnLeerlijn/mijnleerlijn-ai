import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
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

/** Kortlevende signed download-URL — pas genereren op het moment dat een melding daadwerkelijk geopend wordt. */
export async function genereerDownloadUrl(storageKey: string): Promise<string> {
  const signedToken = await issueSignedToken({
    pathname: storageKey,
    operations: ["get"],
    validUntil: Date.now() + DOWNLOAD_URL_GELDIGHEID_MS,
    ...blobAuthOptions(),
  });

  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "get",
    pathname: storageKey,
    access: "private",
    validUntil: Date.now() + DOWNLOAD_URL_GELDIGHEID_MS,
  });

  return presignedUrl;
}

/** Verwijdert een bijlage direct en definitief — gebruikt bij bewaartermijn-verval en "verwijderen op verzoek". */
export async function verwijderBijlage(storageKey: string): Promise<void> {
  await del(storageKey, { ...blobAuthOptions() });
}
