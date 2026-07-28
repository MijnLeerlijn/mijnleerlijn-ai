import { getPayload } from "payload";
import config from "../../payload.config";

// Eenmalig, STRIKT read-only diagnosescript (Blob-store-mismatch-onderzoek,
// 2026-07-28) — schrijft niets, uploadt niets, verwijdert niets. Groepeert
// alle knowledge-sources.file -> media.url hostnames, en vergelijkt met de
// storeId die in de HUIDIGE BLOB_READ_WRITE_TOKEN besloten ligt (token zelf
// wordt nooit afgedrukt, alleen het niet-geheime storeId-segment).
function storeIdUitToken(token: string): string {
  const delen = token.split("_");
  return delen[3] ?? "(onbekend)";
}

async function run() {
  const payload = await getPayload({ config });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const huidigeStoreId = token ? storeIdUitToken(token) : "(geen BLOB_READ_WRITE_TOKEN gezet)";
  console.log(`Huidige BLOB_READ_WRITE_TOKEN hoort bij storeId: ${huidigeStoreId}`);

  const res = await payload.find({
    collection: "knowledge-sources",
    where: { file: { exists: true } },
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  });

  console.log(`\nAantal knowledge-sources met een file-veld: ${res.totalDocs}`);

  const perHost = new Map<string, { count: number; voorbeeldId: number; voorbeeldTitel: string; voorbeeldUrl: string }>();
  let zonderUrl = 0;

  for (const doc of res.docs as unknown as { id: number; title: string; file: { url?: string } | number | null }[]) {
    const file = doc.file;
    const url = typeof file === "object" && file ? file.url : undefined;
    if (!url) {
      zonderUrl += 1;
      continue;
    }
    let host = "(ongeldige URL)";
    try {
      host = new URL(url).hostname;
    } catch {
      // laat "(ongeldige URL)" staan
    }
    const bestaand = perHost.get(host);
    if (bestaand) {
      bestaand.count += 1;
    } else {
      perHost.set(host, { count: 1, voorbeeldId: doc.id, voorbeeldTitel: doc.title, voorbeeldUrl: url });
    }
  }

  console.log(`\nAantal zonder media-url (file-relatie zonder gekoppeld/bestaand media-document): ${zonderUrl}`);
  console.log("\nVerdeling per Blob-hostname:");
  for (const [host, info] of perHost.entries()) {
    const matchtHuidigToken = host.includes(huidigeStoreId.toLowerCase());
    console.log(
      `  ${info.count}x  ${host}  ${matchtHuidigToken ? "← MATCHT huidig token (zou moeten werken)" : "← matcht huidig token NIET (verwacht: Blob not found)"}`
    );
    console.log(`      voorbeeld: id=${info.voorbeeldId} "${info.voorbeeldTitel}"`);
  }

  process.exit(0);
}

run().catch((error) => {
  console.error("Diagnose mislukt:", error);
  process.exit(1);
});
