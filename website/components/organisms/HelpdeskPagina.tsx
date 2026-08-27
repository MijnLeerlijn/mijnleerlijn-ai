import { getPayload } from "payload";
import config from "@/payload.config";
import HelpdeskChat, { type Bericht } from "@/components/organisms/HelpdeskChat";
import HandleidingenSidebar from "@/components/organisms/HandleidingenSidebar";
import CurriculumWerkplaatsCard from "@/components/molecules/CurriculumWerkplaatsCard";
import GradientAccent from "@/components/atoms/GradientAccent";
import { haalTop5VoorbeeldVragen } from "@/lib/helpdesk/top5-voorbeeldvragen";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

// Tijdelijk vast (2026-08-11): zie de identieke toelichting die hiervoor in
// app/(frontend)/(public)/page.tsx stond — ongewijzigd hierheen verplaatst.
const CURRICULUM_WERKPLAATS_URL = "https://curriculum.mijnleerlijn.chat";

interface HelpdeskPaginaProps {
  /** Gesprek delen — zelfde shell (2026-09-02, spec-eis "vrijwel de normale Helpdesk-pagina"): optioneel, alleen gezet vanuit /delen/[token]. */
  initieleBerichten?: Bericht[];
  deelParentToken?: string;
  deelGedeeldOp?: string;
}

// De ÉÉN gedeelde Helpdesk-shell (header komt al via PublicLayout, zie
// app/(frontend)/(public)/layout.tsx) — hergebruikt door zowel de homepage
// (app/(frontend)/(public)/page.tsx, verse chat) als /delen/[token]
// (voorgevulde chat). Vervangt de eerdere aparte, minimale
// gedeelde-chatpagina: een ontvanger van een deel-link ziet nu dezelfde
// twee-koloms lay-out, dezelfde rechterkolom (Curriculum Werkplaats +
// Handleidingen/Downloads) en dezelfde titel/intro als iedereen — geen
// tweede kopie van die onderdelen. Het enige verschil tussen de twee
// aanroepers zit in de props die hier ongewijzigd doorgegeven worden aan
// HelpdeskChat.
export default async function HelpdeskPagina({ initieleBerichten, deelParentToken, deelGedeeldOp }: HelpdeskPaginaProps) {
  const variant = await getActiveVariant();
  const payload = await getPayload({ config });
  const voorbeeldvragen = await haalTop5VoorbeeldVragen(payload, variant.id);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-16">
      <div className="max-w-[720px]">
        <h1 className="text-h1 font-bold text-grijs-900">{variant.websiteTeksten.welkomsttitel}</h1>
        <p className="mt-2 text-base text-grijs-600">{variant.websiteTeksten.welkomsttekst}</p>
        <GradientAccent className="mt-4 w-16" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[70%_30%] lg:gap-12">
        <HelpdeskChat
          voorbeeldvragen={voorbeeldvragen}
          initieleBerichten={initieleBerichten}
          deelParentToken={deelParentToken}
          deelGedeeldOp={deelGedeeldOp}
        />
        <div className="grid gap-6 lg:self-start">
          <CurriculumWerkplaatsCard href={CURRICULUM_WERKPLAATS_URL} />
          <HandleidingenSidebar />
        </div>
      </div>
    </div>
  );
}
