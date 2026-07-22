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
}

const ATTACHMENT_PREFIX = "contact-attachments";
const DOWNLOAD_URL_GELDIGHEID_MS = 5 * 60 * 1000; // 5 minuten

/** Alleen een `token`-property wanneer die expliciet gezet is — anders leeg object, zodat de SDK's eigen (OIDC-)resolutie geldt. */
function blobAuthOptions(): { token: string } | Record<string, never> {
  const token = optionalEnv("BLOB_READ_WRITE_TOKEN");
  return token ? { token } : {};
}

export async function uploadBijlage(bestand: File): Promise<GeuploadBestand> {
  const storageKey = `${ATTACHMENT_PREFIX}/${crypto.randomUUID()}-${bestand.name}`;

  await put(storageKey, bestand, {
    access: "private",
    ...blobAuthOptions(),
    addRandomSuffix: false,
    contentType: bestand.type || "application/octet-stream",
  });

  return {
    storageKey,
    filename: bestand.name,
    mimeType: bestand.type || "application/octet-stream",
    sizeBytes: bestand.size,
  };
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
