import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { requireEnv } from "@/config/env";

// Privé bijlage-opslag voor het contactformulier — zie
// docs/SECURITY-AND-PRIVACY.md §Opslag & toegang bijlagen. Gebruikt Vercel
// Blob's private storage + kortlevende signed URL's rechtstreeks via de
// @vercel/blob-SDK (bewust NIET via Payload's upload-collection-mechanisme —
// zie payload/collections/ContactSubmissions.ts voor de motivatie: Payload's
// vercelBlobStorage-plugin ondersteunt op dit moment alleen 'public'-toegang).
//
// Bewust géén development-fallback zonder token: in tegenstelling tot
// media-afbeeldingen (die via Payload's plugin terugvallen op lokale schijf)
// is dit privacygevoelig — nooit stilzwijgend minder veilig opslaan. Maak
// lokaal een (gratis) Vercel Blob-store aan voor development.

export interface GeuploadBestand {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

const ATTACHMENT_PREFIX = "contact-attachments";
const DOWNLOAD_URL_GELDIGHEID_MS = 5 * 60 * 1000; // 5 minuten

function blobToken(): string {
  return requireEnv("BLOB_READ_WRITE_TOKEN");
}

export async function uploadBijlage(bestand: File): Promise<GeuploadBestand> {
  const token = blobToken();
  const storageKey = `${ATTACHMENT_PREFIX}/${crypto.randomUUID()}-${bestand.name}`;

  await put(storageKey, bestand, {
    access: "private",
    token,
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
  const token = blobToken();
  const signedToken = await issueSignedToken({
    pathname: storageKey,
    operations: ["get"],
    validUntil: Date.now() + DOWNLOAD_URL_GELDIGHEID_MS,
    token,
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
  const token = blobToken();
  await del(storageKey, { token });
}
