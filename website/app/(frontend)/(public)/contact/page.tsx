import type { Metadata } from "next";
import KnowledgeLayout from "@/components/layouts/KnowledgeLayout";
import ContactForm from "@/components/organisms/ContactForm";

interface ContactPaginaProps {
  searchParams: Promise<{ onderwerp?: string }>;
}

export const metadata: Metadata = { title: "Contact — MijnLeerlijn" };

// Bereikbaar met een voorgevuld onderwerp vanuit de "geen betrouwbaar
// antwoord"-flow (NoAnswerState, ArtikelBlok contact_doorverwijzing) via
// ?onderwerp=… — zie IMPLEMENTATION-PLAN.md Fase 3 §Navigatie.
export default async function ContactPagina({ searchParams }: ContactPaginaProps) {
  const { onderwerp } = await searchParams;

  return (
    <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }, { label: "Contact" }]}>
      <div className="max-w-[700px]">
        <h1 className="text-h1 font-bold text-grijs-900">Contact</h1>
        <p className="mt-2 max-w-2xl text-base text-grijs-600">
          Kom je er met de handleidingen niet uit, of denk je dat er iets niet werkt zoals het hoort? Vul
          onderstaand formulier in — een collega neemt persoonlijk contact met je op.
        </p>

        <div className="mt-10">
          <ContactForm initieelOnderwerp={onderwerp} />
        </div>
      </div>
    </KnowledgeLayout>
  );
}
