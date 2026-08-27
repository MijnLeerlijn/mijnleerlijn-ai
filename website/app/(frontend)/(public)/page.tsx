import HelpdeskPagina from "@/components/organisms/HelpdeskPagina";

// Helpdesk MVP 1.0 (2026-07-25): de homepage IS de chatbot — zie het
// akkoord op het wireframevoorstel in de sessiegeschiedenis. Vervangt de
// eerdere Fase 3-dummydata-homepage (Hero/RecentSection/DiscoverSection/
// UpdatesSection, met fictieve demo-artikelen en de twee ?state=-varianten)
// volledig. Die componenten zijn bewust NIET verwijderd, alleen niet meer
// hier gebruikt — geen onnodige refactor, en makkelijk terug te draaien
// mocht dat ooit nodig zijn.
//
// Gesprek delen — zelfde shell (2026-09-02): de eigenlijke pagina-opbouw
// (titel/intro, twee-koloms lay-out, rechterkolom) zit nu in het gedeelde
// components/organisms/HelpdeskPagina.tsx, ook gebruikt door
// /delen/[token] — hier blijft alleen de route zelf over.
export default function Home() {
  return <HelpdeskPagina />;
}
