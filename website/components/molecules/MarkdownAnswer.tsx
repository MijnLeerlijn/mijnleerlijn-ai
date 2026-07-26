import ReactMarkdown from "react-markdown";

interface MarkdownAnswerProps {
  tekst: string;
}

// Rendert een AI-antwoord (koppen/vet/opsommingen/genummerde stappen/links)
// leesbaar i.p.v. de letterlijke `**`/`#`/`-`-tekens te tonen — livegang-
// afwerking, zie het gesprek "Helpdesk MVP 1.0". VEILIG: react-markdown
// rendert uitsluitend de vaste set React-elementen hieronder; ruwe HTML in
// de brontekst wordt NOOIT geïnterpreteerd (geen rehype-raw/dangerouslySetInnerHTML
// — dat is bewust niet toegevoegd), dus een AI-antwoord kan hier nooit
// scriptcode of opmaak buiten deze lijst injecteren. Uitsluitend CommonMark
// (geen remark-gfm): koppen/vet/opsommingen/genummerde stappen/links zijn
// daar al onderdeel van, en dat is precies de gevraagde set — geen tabellen/
// doorstreept/etc. nodig.
export default function MarkdownAnswer({ tekst }: MarkdownAnswerProps) {
  return (
    <div className="text-sm leading-6 text-grijs-900">
      <ReactMarkdown
        allowedElements={["h1", "h2", "h3", "p", "strong", "em", "ul", "ol", "li", "a", "br"]}
        unwrapDisallowed
        components={{
          h1: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-grijs-900">{children}</strong>,
          ul: ({ children }) => <ul className="mb-2 ml-5 list-disc last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-5 list-decimal last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--variant-accent)] underline hover:no-underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {tekst}
      </ReactMarkdown>
    </div>
  );
}
