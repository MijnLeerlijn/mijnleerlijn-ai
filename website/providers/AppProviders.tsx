import type { ReactNode } from "react";
import type { Variant } from "@/types/variant";
import ToastViewport from "@/components/organisms/ToastViewport";
import { VariantProvider } from "./VariantProvider";
import { AuthProvider } from "./AuthProvider";
import { SearchProvider } from "./SearchProvider";
import { ToastProvider } from "./ToastProvider";
import { AnalyticsProvider } from "./AnalyticsProvider";

interface AppProvidersProps {
  variant: Variant;
  children: ReactNode;
}

// Enige plek waar provider-volgorde en -nesting wordt bepaald — zie
// docs/PLATFORM-FOUNDATION.md §6. Geen ThemeProvider: er is bewust geen
// donkere modus (zie docs/UI-DESIGN.md §31). ToastViewport hoort hier (niet
// per pagina) zodat een melding overal getoond kan worden.
export default function AppProviders({ variant, children }: AppProvidersProps) {
  return (
    <VariantProvider variant={variant}>
      <AuthProvider>
        <AnalyticsProvider>
          <ToastProvider>
            <SearchProvider>
              {children}
              <ToastViewport />
            </SearchProvider>
          </ToastProvider>
        </AnalyticsProvider>
      </AuthProvider>
    </VariantProvider>
  );
}
