import { getPayload } from "payload";
import config from "@/payload.config";
import HelpdeskChat from "@/components/organisms/HelpdeskChat";
import HandleidingenSidebar from "@/components/organisms/HandleidingenSidebar";
import GradientAccent from "@/components/atoms/GradientAccent";
import { haalTop5VoorbeeldVragen } from "@/lib/helpdesk/top5-voorbeeldvragen";

async function haalVoorbeeldvragen(): Promise<string[]> {
  const payload = await getPayload({ config });
  return haalTop5VoorbeeldVragen(payload);
}

// Helpdesk MVP 1.0 (2026-07-25): de homepage IS de chatbot — zie het
// akkoord op het wireframevoorstel in de sessiegeschiedenis. Vervangt de
// eerdere Fase 3-dummydata-homepage (Hero/RecentSection/DiscoverSection/
// UpdatesSection, met fictieve demo-artikelen en de twee ?state=-varianten)
// volledig. Die componenten zijn bewust NIET verwijderd, alleen niet meer
// hier gebruikt — geen onnodige refactor, en makkelijk terug te draaien
// mocht dat ooit nodig zijn.
//
// Boven de vouw uitsluitend: logo (in de Header), titel, korte tekst, chat
// — "geen lange introducties, geen verdere afleiding". De 70/30-verdeling
// (chat/sidebar) staat op lg: ernaast; daaronder stapelt de sidebar gewoon
// onder de chat (geen sticky, geen aparte mobiele interactie).
export default async function Home() {
  const voorbeeldvragen = await haalVoorbeeldvragen();

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-16">
      <div className="max-w-[720px]">
        <h1 className="text-h1 font-bold text-grijs-900">Waar kunnen we je mee helpen?</h1>
        <p className="mt-2 text-base text-grijs-600">
          Stel je vraag aan de MijnLeerlijn Assistent. De assistent zoekt automatisch in onze
          handleidingen en kennisbank om je zo goed mogelijk te helpen.
        </p>
        <GradientAccent className="mt-4 w-16" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[70%_30%] lg:gap-12">
        <HelpdeskChat voorbeeldvragen={voorbeeldvragen} />
        <HandleidingenSidebar />
      </div>
    </div>
  );
}
