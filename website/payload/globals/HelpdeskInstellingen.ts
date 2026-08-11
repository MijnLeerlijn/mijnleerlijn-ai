import type { Access, GlobalConfig } from "payload";
import { anyEditor } from "../access/roles";

// TIJDELIJKE DIAGNOSE (2026-08-11) — verwijderen zodra de oorzaak van de
// "You are not allowed to perform this action"-fout in productie bevestigd
// is. Puur observerend: roept anyEditor ongewijzigd aan, verandert geen
// gedrag. Logt uitsluitend Origin, de door Payload daadwerkelijk opgeloste
// serverURL/csrf-lijst en user-id/rol — nooit cookies/tokens/secrets. Zie
// node_modules/payload/dist/auth/extractJWT.js (csrf.includes(origin) is een
// exacte, niet-genormaliseerde string-match) en config/env.ts se
// optionalEnv() (leest process.env ongewijzigd, geen trim).
const anyEditorMetDiagnose: Access = (args) => {
  const origin = args.req.headers?.get?.("origin") ?? null;
  const user = args.req.user as { id?: number; role?: string } | null;
  console.log("[DIAGNOSE helpdesk-instellingen access.update]", {
    origin,
    serverURL: args.req.payload.config.serverURL,
    csrf: args.req.payload.config.csrf,
    userId: user?.id ?? null,
    userRole: user?.role ?? null,
  });
  return anyEditor(args);
};

// Algemene, variant-onafhankelijke Helpdesk-instellingen — publiek leesbaar,
// door elke editor aanpasbaar zonder code (zelfde toegangspatroon als
// payload/globals/HelpdeskVoorbeeldvragen.ts). Curriculum Werkplaats is geen
// apart onderdeel per onderwijsvariant maar één centrale koppeling voor de
// hele Helpdesk — vandaar hier i.p.v. een veld op Variants (adminOnly, zie
// payload/access/roles.ts), zie components/molecules/CurriculumWerkplaatsCard.tsx.
export const HelpdeskInstellingen: GlobalConfig = {
  slug: "helpdesk-instellingen",
  admin: {
    group: "Beheer",
    description: "Algemene instellingen voor de hele Helpdesk, ongeacht welke variant actief is.",
  },
  access: {
    read: () => true,
    update: anyEditorMetDiagnose,
  },
  fields: [
    {
      name: "curriculumWerkplaatsUrl",
      type: "text",
      label: "Curriculum Werkplaats URL",
      admin: {
        description:
          "Optioneel. Leeg = geen Curriculum Werkplaats-kaartje op de homepage. Gevuld = kaartje zichtbaar voor alle varianten.",
      },
    },
  ],
};
