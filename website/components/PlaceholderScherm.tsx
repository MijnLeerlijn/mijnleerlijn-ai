// Tijdelijk bouwhulpmiddel voor Fase 1: bewijst dat een route + layout
// technisch werkt, zonder de echte pagina-inhoud te bouwen (dat is Fase 3,
// zie IMPLEMENTATION-PLAN.md). Wordt per pagina vervangen naarmate Fase 3
// vordert — geen onderdeel van de component library uit Fase 2.
export default function PlaceholderScherm({ titel, schermnummer }: { titel: string; schermnummer?: string }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:px-16">
      <p className="text-sm font-medium tracking-[0.04em] text-grijs-400 uppercase">
        Placeholder{schermnummer ? ` — ${schermnummer}` : ""}
      </p>
      <h1 className="mt-2 text-h2 font-semibold text-grijs-900">{titel}</h1>
    </div>
  );
}
