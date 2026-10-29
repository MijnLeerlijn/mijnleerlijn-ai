"use client";

import s from "./SalesDashboardKeuze.module.css";

export type DashboardVariant = "huidig" | "nieuw";

export function SalesDashboardKeuze({ waarde, onKies }: { waarde: DashboardVariant; onKies: (volgende: DashboardVariant) => void }) {
  return (
    <div className={s.keuze} role="group" aria-label="Welk dashboard">
      <button type="button" aria-pressed={waarde === "huidig"} className={waarde === "huidig" ? s.aan : undefined} onClick={() => onKies("huidig")}>Huidig dashboard</button>
      <button type="button" aria-pressed={waarde === "nieuw"} className={waarde === "nieuw" ? s.aan : undefined} onClick={() => onKies("nieuw")}>Nieuw dashboard (beta)</button>
    </div>
  );
}
