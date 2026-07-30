import { InMemoryVariantResolver } from "./in-memory-variant-resolver";
import type { VariantResolver } from "./variant-resolver";

// Multi-brand variants (2026-07-30): enige plek die een concrete
// VariantResolver-implementatie kiest. Een latere overstap (bv. naar Vercel
// Edge Config/KV) betekent uitsluitend deze regel aanpassen — proxy.ts en de
// rest van de applicatie kennen alleen de VariantResolver-interface.
export const variantResolver: VariantResolver = new InMemoryVariantResolver();
