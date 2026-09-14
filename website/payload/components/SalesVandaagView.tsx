"use client";

// De bestaande /admin/sales custom-view blijft technisch dezelfde route en
// permission-id (sales.overzicht), zodat bestaande restricted accounts niet
// breken. De inhoud is nu het commerciële Sales Dashboard. Operationele
// acties en scholen blijven via hun bestaande eigen pagina's bereikbaar.
export { SalesAnalyticsDashboardView as SalesVandaagView } from "./SalesAnalyticsDashboardView";
