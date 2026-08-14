import type { Payload } from "payload";
import { Link } from "@payloadcms/ui";
import { berekenSalesWidget } from "@/lib/sales/widget-prioritering";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { PlanActieKnop } from "./PlanActieKnop";

// Sales UX V2 (2026-08-14) — "Mijn dag"-widget op het algemene dashboard.
// Server component (net als BeheerDashboard.tsx zelf) — geen eigen fetch,
// roept lib/sales/widget-prioritering.ts rechtstreeks aan via de Local API.
// Toont exact dezelfde info als /admin/sales al toont, alleen samengevat —
// geen ruimere toegang dan Sales zelf (zie het privacy-/securityreview in
// het opleverrapport).
export async function SalesWidgetVandaag({ payload }: { payload: Payload }) {
  const items = await berekenSalesWidget(payload, 5);

  return (
    <section className="ml-sales-widget">
      <div className="ml-sales-widget__header">
        <h2>Sales vandaag</h2>
        <Link href="/admin/sales" className="ml-sales-widget__alles-link" prefetch={false}>
          Bekijk alle Sales →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="ml-sales__leeg">Niets dat vandaag om directe aandacht vraagt.</div>
      ) : (
        <div className="ml-sales-widget__lijst">
          {items.map((item) => (
            <div className="ml-sales-widget__item" key={item.id}>
              <div className="ml-sales-widget__item-header">
                <Link href={`/admin/sales/school?id=${item.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                  {item.schoolName}
                </Link>
                <RelatiestatusBadge relatiestatus={item.relatiestatus} />
              </div>
              <p className="ml-sales-widget__meta">
                {[item.plaats, formatKorteDatum(item.lastMondayActivityAt) !== "—" ? `Laatste contact: ${formatKorteDatum(item.lastMondayActivityAt)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {item.contextTekst && <p className="ml-sales-widget__context">{item.tier === 1 ? item.contextTekst : `AI: ${item.contextTekst}`}</p>}
              <div className="ml-sales__actie-knoppen">
                <Link href={`/admin/sales/school?id=${item.id}`} className="ml-sales__knop" prefetch={false}>
                  Bekijk
                </Link>
                {item.tier === 4 && <PlanActieKnop schoolId={item.id} />}
                <Link href={`/admin/creator?mail=nieuw&school=${item.id}`} className="ml-sales__knop" prefetch={false}>
                  Schrijf mail
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
