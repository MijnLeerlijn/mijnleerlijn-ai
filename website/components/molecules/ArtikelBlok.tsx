import { AlertTriangle, Lightbulb, Download, PlayCircle, MessageCircle } from "lucide-react";
import NextLink from "next/link";
import type { ContentBlock } from "@/types/content";
import { buttonStyles } from "@/components/atoms/Button";
import PlaceholderFoto from "@/components/atoms/PlaceholderFoto";
import { zoekMedia } from "@/lib/data/media";

interface ArtikelBlokProps {
  blok: ContentBlock;
}

// Rendert alle 8 canonieke bloktypes uit types/content.ts (ContentBlockType)
// — zie docs/DATA-MODEL.md. Media wordt hier opgezocht via lib/data/media.ts,
// gevuld door lib/data/factory.ts (dummydata) óf services/payload.ts (echte
// content) — dezelfde opzoekfunctie voor beide bronnen. Zonder een url (geen
// echte beeldbank/upload) tonen afbeeldingen PlaceholderFoto, nooit een
// verzonnen bron.
export default function ArtikelBlok({ blok }: ArtikelBlokProps) {
  if (blok.type === "tekst") {
    // `body` is hier al veilige, door Payload/Lexical gegenereerde HTML
    // (zie services/payload.ts) — geen gebruikersinvoer die hier binnenkomt.
    return (
      <div
        className="flex flex-col gap-4 text-base leading-6 text-grijs-900 [&_a]:text-blauw [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_strong]:font-semibold [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: blok.content.body }}
      />
    );
  }

  if (blok.type === "genummerde_stap") {
    return (
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blauw text-sm font-semibold text-white">
          {blok.content.stepNumber}
        </span>
        <p className="pt-0.5 text-base leading-6 text-grijs-900">{blok.content.body}</p>
      </div>
    );
  }

  if (blok.type === "waarschuwing") {
    return (
      <div className="flex gap-3 rounded-md border-l-4 border-oranje bg-oranje/5 p-4">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-oranje" />
        <div>
          <p className="text-sm font-semibold text-grijs-900">Waarschuwing</p>
          <p className="mt-1 text-sm leading-5 text-grijs-900">{blok.content.body}</p>
        </div>
      </div>
    );
  }

  if (blok.type === "tip") {
    return (
      <div className="flex gap-3 rounded-md border-l-4 border-geel bg-geel/10 p-4">
        <Lightbulb size={20} className="mt-0.5 shrink-0 text-[#8a6b03]" />
        <div>
          <p className="text-sm font-semibold text-grijs-900">Tip</p>
          <p className="mt-1 text-sm leading-5 text-grijs-900">{blok.content.body}</p>
        </div>
      </div>
    );
  }

  if (blok.type === "afbeelding") {
    const media = zoekMedia(blok.content.mediaId);
    return (
      <figure>
        {media?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- afmetingen van CMS-afbeeldingen zijn niet vooraf bekend
          <img src={media.url} alt={media.altText} className="h-auto w-full rounded-md" />
        ) : (
          <PlaceholderFoto label={media?.altText ?? "Afbeelding"} className="h-64 w-full rounded-md" />
        )}
        {blok.content.caption && (
          <figcaption className="mt-2 text-sm text-grijs-600">{blok.content.caption}</figcaption>
        )}
      </figure>
    );
  }

  if (blok.type === "video") {
    return (
      <figure>
        <div className="flex h-56 w-full items-center justify-center rounded-md bg-grijs-900/90 text-white">
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <PlayCircle size={32} strokeWidth={1.5} />
            <span className="text-xs font-medium">Video — placeholder</span>
          </div>
        </div>
        {blok.content.caption && (
          <figcaption className="mt-2 text-sm text-grijs-600">{blok.content.caption}</figcaption>
        )}
      </figure>
    );
  }

  if (blok.type === "download") {
    const media = zoekMedia(blok.content.mediaId);
    return (
      <div className="flex items-center gap-3 rounded-md border border-grijs-200 bg-grijs-50 p-4">
        <Download size={20} aria-hidden className="shrink-0 text-blauw" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-grijs-900">{blok.content.label}</p>
          {media && (
            <p className="text-xs text-grijs-400">{media.type === "download" ? "Download" : media.type}</p>
          )}
        </div>
        {media?.url ? (
          <a href={media.url} download className={`shrink-0 ${buttonStyles("secondary", "compact")}`}>
            Downloaden
          </a>
        ) : (
          <span className={buttonStyles("secondary", "compact")} aria-disabled>
            Downloaden
          </span>
        )}
      </div>
    );
  }

  // contact_doorverwijzing
  const contactHref = blok.content.prefilledSubject
    ? `/contact?onderwerp=${encodeURIComponent(blok.content.prefilledSubject)}`
    : "/contact";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-grijs-200 bg-grijs-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <MessageCircle size={20} aria-hidden className="mt-0.5 shrink-0 text-grijs-600" />
        <p className="text-sm text-grijs-900">{blok.content.body}</p>
      </div>
      <NextLink href={contactHref} className={`shrink-0 ${buttonStyles("secondary", "compact")}`}>
        Naar het contactformulier
      </NextLink>
    </div>
  );
}
