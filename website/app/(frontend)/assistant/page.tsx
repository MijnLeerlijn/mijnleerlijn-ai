import type { Metadata } from "next";
import Link from "next/link";
import { haalSessieOp } from "@/services/auth";
import AssistantChat from "@/components/organisms/AssistantChat";

export const metadata: Metadata = { title: "MijnLeerlijn AI Assistant" };

// Sprint 5 — /assistant, een eigen, volledig-scherm route (buiten (public)
// en (admin), rechtstreeks onder app/(frontend)/), zodat deze noch de
// publieke Header/Footer noch de admin-navigatie krijgt — vergelijkbaar met
// hoe docs/UX-DESIGN.md §4 een "eigen route, volledig scherm" als geldige
// vorm beschrijft voor de AI-chat.
//
// BEWUSTE AFWIJKING van twee bestaande documenten, hier expliciet
// vastgelegd i.p.v. stilzwijgend overschreven:
// 1. docs/SECURITY-AND-PRIVACY.md/PLATFORM-FOUNDATION.md beschrijven de
//    AI-assistent als publiek/anoniem, geen inlog nodig in v1. Deze opdracht
//    ("Alleen ingelogde gebruikers") vraagt expliciet om een inlogmuur. Er
//    bestaat in dit project geen apart publiek gebruikersaccount (alleen de
//    CMS-users-collectie, admin/editor — zie payload/collections/Users.ts) —
//    "ingelogd" betekent hier dus noodzakelijkerwijs "ingelogd als
//    MijnLeerlijn-beheerder/redacteur", niet een klantaccount. Dit is
//    hiermee een intern test-/dogfooding-scherm voor het eigen team, geen
//    publieke lancering — consistent met hoe elke AI-functionaliteit in
//    eerdere sprints (Sprint 2 t/m 4) achter dezelfde login zat.
// 2. Fase 6's "nergens de woorden AI/AI-assistent/chatbot"-regel (bedoeld
//    voor de publieke eindgebruikerservaring) is hier niet van toepassing:
//    dit scherm is voor intern MijnLeerlijn-personeel, dat deze term al
//    overal in het beheerscherm ziet (AI-analyse, AI-samenvatting, enz.).
//
// Sessiecontrole via services/auth.ts::haalSessieOp() (bestond al, was tot
// nu toe nergens daadwerkelijk aangeroepen) — een Server Component-render is
// een gewone GET-navigatie, dus payload.auth() werkt hier prima (zie het
// commentaar in lib/auth/verify-session.ts voor waarom dat NIET geldt voor
// client-side fetch()-POSTs, wat de eigen API-routes hieronder gebruiken).
export default async function AssistantPagina() {
  const sessie = await haalSessieOp();

  if (!sessie) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-grijs-50 px-6 text-center">
        <h1 className="text-xl font-semibold text-grijs-900">MijnLeerlijn AI Assistant</h1>
        <p className="max-w-sm text-sm text-grijs-500">
          Je moet ingelogd zijn als MijnLeerlijn-beheerder of -redacteur om de assistent te gebruiken.
        </p>
        <Link
          href="/admin/login"
          className="rounded-md bg-blauw px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Inloggen
        </Link>
      </main>
    );
  }

  return <AssistantChat gebruikerNaam={sessie.naam} />;
}
