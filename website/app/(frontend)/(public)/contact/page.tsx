import type { Metadata } from "next";
import KnowledgeLayout from "@/components/layouts/KnowledgeLayout";
import ContactForm from "@/components/organisms/ContactForm";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

interface ContactPaginaProps {
  searchParams: Promise<{ onderwerp?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const variant = await getActiveVariant();
  return { title: `Contact — ${variant.branding.productName}` };
}

// Bereikbaar met een voorgevuld onderwerp vanuit de "geen betrouwbaar
// antwoord"-flow (NoAnswerState, ArtikelBlok contact_doorverwijzing) via
// ?onderwerp=… — zie IMPLEMENTATION-PLAN.md Fase 3 §Navigatie.
export default async function ContactPagina({ searchParams }: ContactPaginaProps) {
  const { onderwerp } = await searchParams;
  const variant = await getActiveVariant();

  return (
    <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }, { label: "Contact" }]}>
      <div className="max-w-[700px]">
        <h1 className="text-h1 font-bold text-grijs-900">Contact</h1>
        <p className="mt-2 max-w-2xl text-base text-grijs-600">{variant.websiteTeksten.contactTekst}</p>

        <div className="mt-10">
          <ContactForm initieelOnderwerp={onderwerp} />
        </div>
      </div>
    </KnowledgeLayout>
  );
}
