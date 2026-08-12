import { getPayload } from "payload";
import config from "@/payload.config";
import { defaultVariant } from "@/config/variants";
import { getRootDomain } from "@/config/env";
import { isReservedSlug } from "./reserved-slugs";
import type { VariantResolver } from "./variant-resolver";

// Multi-brand variants (2026-07-30): enige huidige implementatie van
// VariantResolver — host-/pad-gebaseerde herkenning met een simpele
// in-memory TTL-cache. Bewust GEEN rechtstreekse Postgres-driver: dit
// project heeft nergens anders een losse `pg`-afhankelijkheid, en Payload
// cachet zijn eigen geïnitialiseerde instantie al binnen hetzelfde proces
// (Fluid Compute hergebruikt instances) — dezelfde aanpak als elders in de
// codebase (bv. getVariantBySlug in services/payload.ts), niet een nieuw
// patroon erbij.
//
// proxy.ts draait sinds Next.js 16 standaard op de Node.js-runtime (zie
// node_modules/next/dist/docs/.../proxy.md), dus deze Payload-aanroep is
// hier toegestaan. Next.js' eigen documentatie waarschuwt wel dat Proxy "in
// optimized cases" los van de renderende omgeving gedeployed kan worden,
// dus deze module-scope cache is geen harde garantie (kan bij een koude
// start missen) — puur een pragmatische snelheidswinst, nooit een
// correctheidsrisico: bij een cache-miss wordt gewoon opnieuw opgehaald.
interface DomeinRij {
  slug: string;
  domainType: "custom_domain" | "subdomain" | "slug_path";
  domainValue: string;
  actief: boolean;
}

const CACHE_TTL_MS = 60_000;
let cache: { rijen: DomeinRij[]; opgehaaldOp: number } | null = null;

async function haalDomeinTabelOp(): Promise<DomeinRij[]> {
  if (cache && Date.now() - cache.opgehaaldOp < CACHE_TTL_MS) {
    return cache.rijen;
  }
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "variants",
    limit: 200,
    depth: 0,
    overrideAccess: false,
  });
  const rijen: DomeinRij[] = result.docs.map((doc) => {
    const d = doc as unknown as {
      slug: string;
      domain: { type: DomeinRij["domainType"]; value: string };
      actief?: boolean | null;
    };
    return {
      slug: d.slug,
      domainType: d.domain.type,
      domainValue: d.domain.value,
      actief: Boolean(d.actief),
    };
  });
  cache = { rijen, opgehaaldOp: Date.now() };
  return rijen;
}

export class InMemoryVariantResolver implements VariantResolver {
  async resolveSlug(host: string, pathname: string): Promise<string> {
    const schoneHost = (host.split(":")[0] ?? "").toLowerCase();

    let rijen: DomeinRij[];
    try {
      rijen = await haalDomeinTabelOp();
    } catch {
      // Opzoeking mislukt (bv. database tijdelijk onbereikbaar) — de
      // publieke site mag hierdoor nooit stukgaan, val terug op de
      // standaardvariant (dezelfde bescherming als get-active-variant.ts
      // verderop in de keten biedt voor déze specifieke variant).
      return defaultVariant.slug;
    }

    const isDefault = (rij: DomeinRij) => rij.slug === defaultVariant.slug;
    // Een niet-actieve variant wordt overgeslagen alsof 'm niet bestaat —
    // BEHALVE de standaardvariant zelf, die altijd bereikbaar moet blijven
    // ongeacht een (foutief) actief=false op dat record.
    const geldig = (rij: DomeinRij) => rij.actief || isDefault(rij);
    // Alleen een écht gereserveerde slug uitsluiten (defensief — de
    // beforeValidate-hook op Variants voorkomt dit al bij het opslaan, dit
    // is de tweede laag, zie lib/variant/reserved-slugs.ts).
    const nietGereserveerd = (rij: DomeinRij) => !isReservedSlug(rij.slug);
    const hoofddomein = getRootDomain().toLowerCase();

    // 1. Eigen domein van een ANDERE (niet-standaard) variant — deze blijft
    // de enige uitzondering die niet generiek via slug loopt (een variant
    // met een echt, extern domein heeft geen subdomein/pad-vorm nodig).
    const customMatch = rijen.find(
      (r) => !isDefault(r) && r.domainType === "custom_domain" && r.domainValue.toLowerCase() === schoneHost && geldig(r)
    );
    if (customMatch) return customMatch.slug;

    // 2. Subdomein — generiek voor elke actieve, niet-standaard variant
    // zonder eigen domein: {slug}.{hoofddomein}. Vroeger gekoppeld aan
    // domain.value + domain.type === "subdomain" (exclusief t.o.v. stap 3);
    // nu rechtstreeks op `slug` (de bron van waarheid) en niet meer
    // exclusief — een variant is voortaan altijd via beide vormen
    // bereikbaar, ongeacht `domain.type` (subdomain/slug_path betekenen nu
    // hetzelfde, zie payload/collections/Variants.ts).
    const subdomainMatch = rijen.find(
      (r) =>
        !isDefault(r) &&
        r.domainType !== "custom_domain" &&
        nietGereserveerd(r) &&
        schoneHost === `${r.slug}.${hoofddomein}` &&
        geldig(r)
    );
    if (subdomainMatch) return subdomainMatch.slug;

    // 3. Pad-gebaseerde slug — generiek, zelfde variant-verzameling als
    // stap 2, uitsluitend zinvol op de hoofdsite zelf (kaal domein of
    // www-vorm), niet op een willekeurig ander domein.
    if (schoneHost === hoofddomein || schoneHost === `www.${hoofddomein}`) {
      const eersteSegment = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      if (eersteSegment) {
        const slugMatch = rijen.find(
          (r) =>
            !isDefault(r) &&
            r.domainType !== "custom_domain" &&
            nietGereserveerd(r) &&
            r.slug === eersteSegment &&
            geldig(r)
        );
        if (slugMatch) return slugMatch.slug;
      }
    }

    // 4. Geen match — standaardvariant.
    return defaultVariant.slug;
  }
}
