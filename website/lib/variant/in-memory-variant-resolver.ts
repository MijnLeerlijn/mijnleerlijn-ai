import { getPayload } from "payload";
import config from "@/payload.config";
import { defaultVariant } from "@/config/variants";
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
    const hoofddomein = rijen.find(isDefault)?.domainValue?.toLowerCase();

    // 1. Eigen domein van een ANDERE (niet-standaard) variant — de
    // standaardvariant zelf wordt hier bewust uitgesloten, zodat een
    // pad-gebaseerde slug (stap 3) op het hoofddomein altijd nog een kans
    // krijgt vóórdat er op de standaardvariant wordt teruggevallen.
    const customMatch = rijen.find(
      (r) => !isDefault(r) && r.domainType === "custom_domain" && r.domainValue.toLowerCase() === schoneHost && geldig(r)
    );
    if (customMatch) return customMatch.slug;

    // 2. Subdomein t.o.v. het hoofddomein (de standaardvariant se eigen domein).
    if (hoofddomein) {
      const subdomainMatch = rijen.find(
        (r) =>
          r.domainType === "subdomain" &&
          schoneHost === `${r.domainValue.toLowerCase()}.${hoofddomein}` &&
          geldig(r)
      );
      if (subdomainMatch) return subdomainMatch.slug;
    }

    // 3. Pad-gebaseerde slug — uitsluitend zinvol op het hoofddomein zelf
    // (bijv. mijnleerlijn.chat/mijnmonti/...), niet op een ander domein.
    if (!hoofddomein || schoneHost === hoofddomein) {
      const eersteSegment = pathname.split("/").filter(Boolean)[0];
      if (eersteSegment) {
        const slugMatch = rijen.find(
          (r) => r.domainType === "slug_path" && r.slug === eersteSegment.toLowerCase() && geldig(r)
        );
        if (slugMatch) return slugMatch.slug;
      }
    }

    // 4. Geen match — standaardvariant.
    return defaultVariant.slug;
  }
}
