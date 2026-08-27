import type { Metadata } from "next";
import Link from "next/link";
import { getPayload } from "payload";
import { ArrowLeft } from "lucide-react";
import config from "@/payload.config";
import { haalGedeeldeChat, type GedeeldeChatWeergave } from "@/lib/helpdesk/delen";
import HelpdeskChat, { type Bericht } from "@/components/organisms/HelpdeskChat";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

interface DeelPaginaProps {
  params: Promise<{ token: string }>;
}

// Chat delen via URL — herbouw (2026-09-01, spec-eis §2/§5/§6/§7) — de
// publieke deelpagina is niet langer een losse, alleen-lezen weergave: dit
// rendert nu dezelfde HelpdeskChat als de homepage, voorgevuld met het
// bevroren snapshot (initieleBerichten) — de bezoeker kan er direct onder
// verder chatten (spec-eis §2), zonder in te loggen en zonder eerst terug
// naar "/" te hoeven. Elk NIEUW bericht van de bezoeker is een FORK
// (client-side React-state, spec-eis §6): het bestaande, bevroren snapshot
// verandert hier nooit — een latere eigen "Gesprek delen"-klik van DEZE
// bezoeker (spec-eis §7) stuurt zowel deze token als de eigen nieuwe
// conversationId's mee (zie DeelGesprekKnop.tsx/lib/helpdesk/delen.ts se
// maakDeelLink), zodat de VOLGENDE link weer de volledige, samengevoegde
// geschiedenis erft.
//
// Root cause van de vorige "werkt niet betrouwbaar bij een ander"-klacht
// (spec-eis §3, zie het opleverrapport voor de volledige analyse): de
// server-side leesroute zelf (haalGedeeldeChat, hieronder) was al
// onafhankelijk van cookies/localStorage/sessionStorage/login/browserstate
// van de maker — dat is hier bevestigd ongewijzigd gebleven. De vorige
// versie miste echter elke manier om ONDER het gedeelde gesprek verder te
// praten (geen invoerveld, geen enkele indicatie waarom), wat voor een
// ontvanger als "de link doet het niet" oogt. Deze herbouw sluit die hele
// klasse van "verschilt per browser/gebruiker"-problemen bovendien
// structureel uit: alles wat nodig is om de pagina te tonen komt uitsluitend
// via het share-token (haalGedeeldeChat hieronder) — geen enkele afhankelijkheid
// van wie de pagina opent.
//
// noindex/nofollow (spec §A8, ongewijzigd): een gedeeld gesprek mag nooit in
// een zoekmachine terechtkomen.
export async function generateMetadata({ params }: DeelPaginaProps): Promise<Metadata> {
  const variant = await getActiveVariant();
  return {
    title: `Gedeeld gesprek — ${variant.branding.productName} Helpdesk`,
    robots: { index: false, follow: false },
  };
}

function formatGedeeldOp(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

async function haalData(token: string): Promise<GedeeldeChatWeergave | null> {
  // Lichte vormcontrole vóór de databaselookup — een duidelijk ongeldige
  // tokenvorm hoeft nooit tegen de database gehasht/vergeleken te worden.
  // Geen beveiligingsgrens op zich (een ontbrekende/ingetrokken token geeft
  // hieronder toch al hetzelfde "niet beschikbaar"-resultaat), puur hygiëne.
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;

  const payload = await getPayload({ config });
  const uitkomst = await haalGedeeldeChat(payload, token);
  return uitkomst.soort === "ok" ? uitkomst.data : null;
}

/** Zet een bevroren snapshot-bericht om naar de vorm die HelpdeskChat al kent — conversationId altijd null (het is geen eigen /api/helpdesk/ask-aanroep van deze bezoeker), zie HelpdeskChat.tsx se deelbareConversationIds-toelichting. */
function naarBericht(bericht: GedeeldeChatWeergave["berichten"][number], index: number): Bericht {
  return {
    id: `gedeeld-${index}`,
    vraag: bericht.vraag,
    status: "klaar",
    toonContact: false,
    antwoord: {
      conversationId: null,
      hasAnswer: bericht.hasAnswer,
      answer: bericht.antwoord,
      manuals: bericht.manuals,
      steps: bericht.steps,
    },
  };
}

export default async function DeelPagina({ params }: DeelPaginaProps) {
  const { token } = await params;
  const data = await haalData(token);

  if (!data) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-8">
        <h1 className="text-h2 font-bold text-grijs-900">Deze gedeelde chat is niet meer beschikbaar.</h1>
        <p className="mt-3 text-base text-grijs-600">
          De link is ingetrokken, of bestaat niet (meer). Je kunt wel altijd een nieuwe vraag stellen.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[var(--variant-accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          <ArrowLeft size={16} aria-hidden />
          Naar de Helpdesk
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      <HelpdeskChat
        initieleBerichten={data.berichten.map(naarBericht)}
        deelParentToken={token}
        deelGedeeldOp={formatGedeeldOp(data.gedeeldOp)}
      />
    </div>
  );
}
