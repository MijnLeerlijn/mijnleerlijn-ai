"use client";

import { Suspense, useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Link, SelectInput, TextInput, toast } from "@payloadcms/ui";
import type { ContextItem } from "@/lib/assistant/build-context";
import type { CreatorChatBericht } from "@/lib/creator/creator-chat";
import type { AfgeleideKanaal } from "@/lib/creator/derive-channel";

// Creator V1 (2026-08-13) — zie de sessie-onderzoeksfase (technisch
// voorstel A-M) voor de volledige architectuur-onderbouwing. Eén statisch
// geregistreerd pad ("/creator", payload.config.ts), net als
// CurriculumWerkplaatsView.tsx: startscherm/werkruimte/mailflow wisselen
// client-side via ?artikel=<id> / ?mail=<id>, geen dynamisch routesegment
// (zelfde, al-bewezen aanpak als daar — zie het commentaar in dat bestand).
//
// Documenteditor (middenkolom van de werkruimte): bewust GEEN nieuwe
// rich-text-editor. De echte inhoud blijft het bestaande Articles.sections-
// veld (Lexical richText per "tekst"-blok); hier alleen een platte-tekst-
// weergave van het EERSTE tekstblok om snel te kunnen schrijven/laten
// aanvullen door AI. Voor de volledige sectie-/blokstructuur verwijst
// "Volledig bewerken" naar Payload's eigen, ongewijzigde Article-editor.
//
// Elke schrijfactie (artikel aanmaken/bijwerken, variant-versie/afgeleide
// content/mailconcept/kennisstuk opslaan) gaat via Payload's EIGEN
// REST-API (fetch met credentials:"include") — geen tweede, aparte
// opslaglaag. Alleen de AI-aanroepen zelf lopen via de 5 nieuwe
// app/api/creator/*-routes (die op hun beurt lib/creator/* aanroepen).

type CreatorRoute = "inhoudelijk" | "software";

interface RecentItem {
  id: number | string;
  type: "artikel" | "mail";
  titel: string;
  status: string;
  updatedAt: string;
}

interface VariantOptie {
  id: string;
  name: string;
  terminologyDictionary: { centralTerm: string; variantTerm: string }[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 80);
}

function tekstNaarLexical(tekst: string) {
  const regels = tekst.split("\n").filter((r) => r.trim().length > 0);
  const children = (regels.length > 0 ? regels : [""]).map((regel) => ({
    type: "paragraph",
    version: 1,
    children: [{ type: "text", version: 1, text: regel }],
  }));
  return { root: { type: "root", version: 1, children, direction: "ltr", format: "", indent: 0 } };
}

function lexicalNaarTekst(waarde: unknown): string {
  if (!waarde || typeof waarde !== "object") return "";
  const root = (waarde as { root?: { children?: unknown[] } }).root;
  if (!root?.children) return "";
  return root.children
    .map((node) => {
      const n = node as { children?: { text?: string }[] };
      return (n.children ?? []).map((c) => c.text ?? "").join("");
    })
    .join("\n");
}

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as (T & { errors?: { message?: string }[] }) | null;
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || "Actie mislukt.");
  return data as T;
}

export function CreatorView() {
  return (
    <Suspense fallback={null}>
      <CreatorViewInner />
    </Suspense>
  );
}

function CreatorViewInner() {
  const searchParams = useSearchParams();
  const artikelId = searchParams.get("artikel");
  const mailId = searchParams.get("mail");

  if (artikelId) return <Werkruimte artikelId={artikelId} />;
  if (mailId) return <MailFlow mailId={mailId} />;
  return <StartScreen />;
}

// --- Startscherm ---------------------------------------------------------

const ROUTE_BESCHRIJVING: Record<CreatorRoute, { titel: string; tekst: string; knowledgeType: "product" | "pedagogisch" }> = {
  inhoudelijk: {
    titel: "Inhoudelijk artikel",
    tekst: "Schrijf samen met AI over onderwijs, curriculum, kerndoelen, visie of een ander inhoudelijk onderwerp.",
    knowledgeType: "pedagogisch",
  },
  software: {
    titel: "MijnLeerlijn / software",
    tekst: "Maak uitleg, tips of een artikel over een bestaande of nieuwe functionaliteit. De AI gebruikt hierbij de bestaande productkennis.",
    knowledgeType: "product",
  },
};

function StartScreen() {
  const router = useRouter();
  const [actieveRoute, setActieveRoute] = useState<CreatorRoute | null>(null);
  const [titel, setTitel] = useState("");
  const [bezig, setBezig] = useState(false);
  const [recent, setRecent] = useState<RecentItem[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [artikelenRes, mailRes] = await Promise.all([
          fetch("/api/articles?where[createdViaCreator][equals]=true&sort=-updatedAt&limit=5&depth=0", { credentials: "include" }),
          fetch("/api/mail-drafts?sort=-updatedAt&limit=5&depth=0", { credentials: "include" }),
        ]);
        const artikelen = await json<{ docs: { id: number; title: string; articleStatus: string; updatedAt: string }[] }>(artikelenRes);
        const mails = await json<{ docs: { id: number; subject?: string; status: string; updatedAt: string }[] }>(mailRes);
        const items: RecentItem[] = [
          ...artikelen.docs.map((a) => ({ id: a.id, type: "artikel" as const, titel: a.title, status: a.articleStatus, updatedAt: a.updatedAt })),
          ...mails.docs.map((m) => ({ id: m.id, type: "mail" as const, titel: m.subject || "(zonder onderwerp)", status: m.status, updatedAt: m.updatedAt })),
        ]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 5);
        setRecent(items);
      } catch {
        setRecent([]);
      }
    })();
  }, []);

  async function startArtikel(route: CreatorRoute, uniekeSuffix: string) {
    const gekozenTitel = titel.trim();
    if (!gekozenTitel) return;
    setBezig(true);
    try {
      const categorieenRes = await fetch("/api/categories?limit=1", { credentials: "include" });
      const categorieen = await json<{ docs: { id: number }[] }>(categorieenRes);
      const categoryId = categorieen.docs[0]?.id;
      if (!categoryId) throw new Error("Er bestaat nog geen categorie — maak er eerst één aan bij Categorieën.");

      const res = await fetch("/api/articles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: gekozenTitel,
          slug: `${slugify(gekozenTitel)}-${uniekeSuffix}`,
          summary: "Concept via Creator — nog aan te vullen.",
          category: categoryId,
          articleStatus: "concept",
          knowledgeType: ROUTE_BESCHRIJVING[route].knowledgeType,
          createdViaCreator: true,
          sections: [{ title: "Inhoud", blocks: [{ blockType: "tekst", body: tekstNaarLexical("Nog te schrijven.") }] }],
        }),
      });
      const data = await json<{ doc: { id: number } }>(res);
      router.push(`/admin/creator?artikel=${data.doc.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aanmaken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="ml-creator">
      <h1 className="ml-creator__title">Wat wil je maken?</h1>

      <div className="ml-creator__routes">
        {(Object.keys(ROUTE_BESCHRIJVING) as CreatorRoute[]).map((route) => (
          <div className="ml-creator__route-card" key={route}>
            <h2>{ROUTE_BESCHRIJVING[route].titel}</h2>
            <p>{ROUTE_BESCHRIJVING[route].tekst}</p>
            {actieveRoute === route ? (
              <div className="ml-creator__route-start">
                <TextInput path="titel" label="Titel" value={titel} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitel(e.target.value)} placeholder="Bijv. Doelen plannen" />
                <Button buttonStyle="primary" size="small" disabled={bezig || !titel.trim()} onClick={() => startArtikel(route, Date.now().toString(36))}>
                  {bezig ? "Bezig..." : "Start"}
                </Button>
              </div>
            ) : (
              <Button
                buttonStyle="secondary"
                size="small"
                onClick={() => {
                  setActieveRoute(route);
                  setTitel("");
                }}
              >
                Kiezen
              </Button>
            )}
          </div>
        ))}

        <div className="ml-creator__route-card">
          <h2>Mail schrijven</h2>
          <p>Schrijf een inhoudelijke reactie op een mail met gebruik van de MijnLeerlijn-kennisbasis.</p>
          <Link href="/admin/creator?mail=nieuw" className="ml-creator__route-link">
            <Button buttonStyle="secondary" size="small" el="div">
              Kiezen
            </Button>
          </Link>
        </div>
      </div>

      <div className="ml-creator__recent">
        <h2>Verder met...</h2>
        {recent === null && <p>Laden...</p>}
        {recent !== null && recent.length === 0 && <p>Nog niets om verder mee te gaan — kies hierboven een route om te beginnen.</p>}
        {recent !== null && recent.length > 0 && (
          <ul className="ml-creator__recent-list">
            {recent.map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <Link href={item.type === "artikel" ? `/admin/creator?artikel=${item.id}` : `/admin/creator?mail=${item.id}`}>
                  <span className="ml-creator__recent-titel">{item.titel}</span>
                  <span className="ml-creator__recent-meta">
                    {item.type === "artikel" ? "Artikel" : "Mail"} · {item.status} · {new Date(item.updatedAt).toLocaleDateString("nl-NL")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="ml-creator__archief-hint">Archief volgt in een latere fase.</p>
      </div>
    </div>
  );
}

// --- Werkruimte ------------------------------------------------------------

interface ArtikelDoc {
  id: number;
  title: string;
  articleStatus: string;
  aiKnowledgeStatus: "uit" | "actief";
  knowledgeType: "product" | "pedagogisch";
  sections: { id: string; title: string; blocks: { id: string; blockType: string; body?: unknown }[] }[];
}

function Werkruimte({ artikelId }: { artikelId: string }) {
  const [artikel, setArtikel] = useState<ArtikelDoc | null>(null);
  const [documentTekst, setDocumentTekst] = useState("");
  const [opslaan, setOpslaan] = useState(false);

  const [berichten, setBerichten] = useState<CreatorChatBericht[]>([]);
  const [chatInvoer, setChatInvoer] = useState("");
  const [chatBezig, setChatBezig] = useState(false);
  const [gebruikteKennis, setGebruikteKennis] = useState<ContextItem[]>([]);

  const [varianten, setVarianten] = useState<VariantOptie[]>([]);
  const [gekozenVariant, setGekozenVariant] = useState<string>("");
  const [variantBezig, setVariantBezig] = useState(false);

  const [kanaalBezig, setKanaalBezig] = useState<AfgeleideKanaal | null>(null);

  const laadArtikel = useCallback(async () => {
    try {
      const res = await fetch(`/api/articles/${artikelId}?depth=0`, { credentials: "include" });
      const doc = await json<ArtikelDoc>(res);
      setArtikel(doc);
      const eersteTekstBlok = doc.sections?.[0]?.blocks?.find((b) => b.blockType === "tekst");
      setDocumentTekst(eersteTekstBlok ? lexicalNaarTekst(eersteTekstBlok.body) : "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Artikel laden mislukt.");
    }
  }, [artikelId]);

  useEffect(() => {
    (async () => {
      await laadArtikel();
    })();
    (async () => {
      try {
        const res = await fetch("/api/variants?limit=100&sort=name&depth=0", { credentials: "include" });
        const data = await json<{ docs: { id: string; name: string; terminologyDictionary?: { centralTerm: string; variantTerm: string }[] }[] }>(res);
        setVarianten(data.docs.map((v) => ({ id: v.id, name: v.name, terminologyDictionary: v.terminologyDictionary ?? [] })));
      } catch {
        setVarianten([]);
      }
    })();
  }, [laadArtikel]);

  async function slaOp(velden: Record<string, unknown>) {
    if (!artikel) return;
    setOpslaan(true);
    try {
      const res = await fetch(`/api/articles/${artikel.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(velden),
      });
      await json(res);
      await laadArtikel();
      toast.success("Opgeslagen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setOpslaan(false);
    }
  }

  function slaDocumentOp() {
    if (!artikel) return;
    if (!documentTekst.trim()) {
      toast.error("Lege tekst kan niet opgeslagen worden — schrijf eerst iets, of vraag de AI om een aanzet.");
      return;
    }
    const bestaandeSecties = artikel.sections ?? [{ id: "", title: "Inhoud", blocks: [] }];
    const [eerste, ...rest] = bestaandeSecties;
    const overigeBlokken = (eerste?.blocks ?? []).filter((b) => b.blockType !== "tekst");
    const nieuweSecties = [{ title: eerste?.title || "Inhoud", blocks: [{ blockType: "tekst", body: tekstNaarLexical(documentTekst) }, ...overigeBlokken] }, ...rest];
    slaOp({ sections: nieuweSecties });
  }

  async function stuurChatBericht() {
    if (!artikel || !chatInvoer.trim()) return;
    const nieuweBerichten: CreatorChatBericht[] = [...berichten, { role: "user", content: chatInvoer.trim() }];
    setBerichten(nieuweBerichten);
    setChatInvoer("");
    setChatBezig(true);
    try {
      const res = await fetch("/api/creator/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentTitel: artikel.title,
          documentTekst,
          berichten: nieuweBerichten,
          knowledgeType: artikel.knowledgeType,
        }),
      });
      const data = await json<{ antwoord: string; gebruikteKennis: ContextItem[] }>(res);
      setBerichten([...nieuweBerichten, { role: "assistant", content: data.antwoord }]);
      setGebruikteKennis(data.gebruikteKennis);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI-gesprek mislukt.");
      setBerichten(berichten);
    } finally {
      setChatBezig(false);
    }
  }

  async function maakVariantVersie() {
    if (!artikel || !gekozenVariant) return;
    const variant = varianten.find((v) => v.id === gekozenVariant);
    if (!variant) return;
    setVariantBezig(true);
    try {
      const res = await fetch("/api/creator/variant-adapt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterTitel: artikel.title,
          masterTekst: documentTekst,
          targetVariantId: variant.id,
          targetVariantNaam: variant.name,
          terminologyDictionary: variant.terminologyDictionary,
        }),
      });
      const data = await json<{ aangepasteTekst: string }>(res);
      const overrideRes = await fetch("/api/variant-overrides", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: variant.id,
          targetArticle: artikel.id,
          targetType: "article",
          targetId: String(artikel.id),
          action: "vervangen",
          payload: { tekst: data.aangepasteTekst },
          status: "concept",
          generatedByAi: true,
          basedOnArticleVersion: String(artikel.id),
        }),
      });
      const overrideData = await json<{ doc: { id: number } }>(overrideRes);
      toast.success(`${variant.name}-versie aangemaakt (concept).`);
      window.open(`/admin/collections/variant-overrides/${overrideData.doc.id}`, "_blank");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Variant-versie maken mislukt.");
    } finally {
      setVariantBezig(false);
    }
  }

  async function maakAfgeleideContent(channel: AfgeleideKanaal) {
    if (!artikel) return;
    setKanaalBezig(channel);
    try {
      const res = await fetch("/api/creator/derive-channel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bronTitel: artikel.title, bronTekst: documentTekst, channel }),
      });
      const data = await json<{ titel?: string; tekst: string; cta?: string }>(res);
      const derivedRes = await fetch("/api/derived-content", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceArticle: artikel.id,
          channel,
          title: data.titel,
          content: data.tekst,
          cta: data.cta,
          status: "concept",
          generatedByAi: true,
        }),
      });
      const derivedData = await json<{ doc: { id: number } }>(derivedRes);
      toast.success(`${channel} aangemaakt (concept).`);
      window.open(`/admin/collections/derived-content/${derivedData.doc.id}`, "_blank");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Afgeleide content maken mislukt.");
    } finally {
      setKanaalBezig(null);
    }
  }

  if (!artikel) return <div className="ml-creator">Laden...</div>;

  return (
    <div className="ml-creator ml-creator--werkruimte">
      <div className="ml-creator__kolom ml-creator__kolom--chat">
        <h2>AI-gesprek</h2>
        <div className="ml-creator__chat-berichten">
          {berichten.length === 0 && <p className="ml-creator__chat-leeg">Vraag de AI bijvoorbeeld: &ldquo;Maak de intro minder commercieel&rdquo; of &ldquo;Geef een praktisch voorbeeld&rdquo;.</p>}
          {berichten.map((b, i) => (
            <div key={i} className={`ml-creator__bericht ml-creator__bericht--${b.role}`}>
              {b.content}
            </div>
          ))}
        </div>
        <textarea
          className="ml-creator__chat-invoer"
          value={chatInvoer}
          onChange={(e) => setChatInvoer(e.target.value)}
          placeholder="Typ een instructie voor de AI..."
          rows={3}
        />
        <Button buttonStyle="primary" size="small" disabled={chatBezig || !chatInvoer.trim()} onClick={stuurChatBericht}>
          {chatBezig ? "Bezig..." : "Versturen"}
        </Button>

        <div className="ml-creator__gebruikte-kennis">
          <h3>Gebruikte kennis</h3>
          {gebruikteKennis.length === 0 ? <p>Nog geen kennis opgehaald.</p> : <ul>{gebruikteKennis.map((k) => <li key={`${k.refCollection}-${k.refId}`}>{k.title}</li>)}</ul>}
        </div>
      </div>

      <div className="ml-creator__kolom ml-creator__kolom--editor">
        <h2>{artikel.title}</h2>
        <textarea className="ml-creator__editor" value={documentTekst} onChange={(e) => setDocumentTekst(e.target.value)} rows={20} />
        <div className="ml-creator__editor-acties">
          <Button buttonStyle="primary" size="small" disabled={opslaan} onClick={slaDocumentOp}>
            {opslaan ? "Opslaan..." : "Opslaan"}
          </Button>
          <Link href={`/admin/collections/articles/${artikel.id}`}>Volledig bewerken (alle secties/blokken)</Link>
        </div>
      </div>

      <div className="ml-creator__kolom ml-creator__kolom--rechts">
        <section>
          <h3>Publicatie</h3>
          <SelectInput
            path="articleStatus"
            name="articleStatus"
            label="Status"
            value={artikel.articleStatus}
            options={[
              { label: "Concept", value: "concept" },
              { label: "In review", value: "in_review" },
              { label: "Gepubliceerd", value: "gepubliceerd" },
              { label: "Gearchiveerd", value: "gearchiveerd" },
            ]}
            onChange={(optie) => {
              const gekozen = Array.isArray(optie) ? optie[0] : optie;
              if (gekozen && "value" in gekozen) slaOp({ articleStatus: gekozen.value });
            }}
          />
        </section>

        <section>
          <h3>AI-kennis</h3>
          <Button buttonStyle={artikel.aiKnowledgeStatus === "actief" ? "primary" : "secondary"} size="small" onClick={() => slaOp({ aiKnowledgeStatus: artikel.aiKnowledgeStatus === "actief" ? "uit" : "actief" })}>
            {artikel.aiKnowledgeStatus === "actief" ? "Gebruikt als kennis voor Helpdesk-AI — uitzetten" : "Gebruik als kennis voor Helpdesk-AI"}
          </Button>
        </section>

        <section>
          <h3>Onderwijsvarianten</h3>
          <SelectInput
            path="variant"
            name="variant"
            label="Maak versie voor"
            value={gekozenVariant}
            options={varianten.map((v) => ({ label: v.name, value: v.id }))}
            onChange={(optie) => {
              const gekozen = Array.isArray(optie) ? optie[0] : optie;
              setGekozenVariant(gekozen && "value" in gekozen ? String(gekozen.value) : "");
            }}
          />
          <Button buttonStyle="secondary" size="small" disabled={!gekozenVariant || variantBezig} onClick={maakVariantVersie}>
            {variantBezig ? "Bezig..." : "Maak variant-versie"}
          </Button>
        </section>

        <section>
          <h3>Maak hiervan</h3>
          {(["nieuwsbrief", "linkedin", "partnertekst"] as AfgeleideKanaal[]).map((channel) => (
            <Button key={channel} buttonStyle="secondary" size="small" disabled={kanaalBezig === channel} onClick={() => maakAfgeleideContent(channel)}>
              {kanaalBezig === channel ? "Bezig..." : channel === "nieuwsbrief" ? "Nieuwsbrief" : channel === "linkedin" ? "LinkedIn" : "Partnertekst"}
            </Button>
          ))}
        </section>
      </div>
    </div>
  );
}

// --- Mail schrijven --------------------------------------------------------

interface MailDraftDoc {
  id: number;
  subject?: string;
  receivedText?: string;
  draftReply?: string;
  status: string;
  linkedKnowledgeDraft?: number | null;
}

function MailFlow({ mailId }: { mailId: string }) {
  const router = useRouter();
  const isNieuw = mailId === "nieuw";
  const [mail, setMail] = useState<MailDraftDoc | null>(isNieuw ? { id: 0, status: "concept" } : null);
  const [ontvangenTekst, setOntvangenTekst] = useState("");
  const [conceptAntwoord, setConceptAntwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [kennisstukVoorstel, setKennisstukVoorstel] = useState<{
    title: string;
    question: string;
    shortAnswer: string;
    fullAnswer: string;
    customerSpecificInformationFound: boolean;
    customerSpecificInformationExplanation?: string;
  } | null>(null);

  useEffect(() => {
    if (isNieuw) return;
    (async () => {
      try {
        const res = await fetch(`/api/mail-drafts/${mailId}?depth=0`, { credentials: "include" });
        const doc = await json<MailDraftDoc>(res);
        setMail(doc);
        setOntvangenTekst(doc.receivedText ?? "");
        setConceptAntwoord(doc.draftReply ?? "");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Mailconcept laden mislukt.");
      }
    })();
  }, [mailId, isNieuw]);

  async function genereerAntwoord() {
    if (!ontvangenTekst.trim()) return;
    setBezig(true);
    try {
      const res = await fetch("/api/creator/mail-reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ontvangenTekst }),
      });
      const data = await json<{ conceptAntwoord: string }>(res);
      setConceptAntwoord(data.conceptAntwoord);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conceptantwoord genereren mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function slaMailOp() {
    setBezig(true);
    try {
      const body = JSON.stringify({
        subject: ontvangenTekst.slice(0, 80) || "Mailconcept",
        receivedText: ontvangenTekst,
        draftReply: conceptAntwoord,
        status: "concept",
      });
      if (isNieuw || !mail?.id) {
        const res = await fetch("/api/mail-drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body });
        const data = await json<{ doc: { id: number } }>(res);
        toast.success("Mailconcept opgeslagen.");
        router.push(`/admin/creator?mail=${data.doc.id}`);
      } else {
        const res = await fetch(`/api/mail-drafts/${mail.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body });
        await json(res);
        toast.success("Mailconcept opgeslagen.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function maakKennisstukVoorstel() {
    if (!ontvangenTekst.trim() || !conceptAntwoord.trim()) return;
    setBezig(true);
    try {
      const res = await fetch("/api/creator/mail-to-knowledge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ontvangenTekst, conceptAntwoord }),
      });
      setKennisstukVoorstel(await json(res));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kennisstuk maken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function keurKennisstukGoed() {
    if (!kennisstukVoorstel || !mail?.id) return;
    setBezig(true);
    try {
      // KnowledgeDrafts.access.create is bewust `() => false` (nooit via de
      // publieke REST-API, zie dat collectiebestand) — deze route doet de
      // aanmaak + mail-koppeling server-side met overrideAccess, in plaats
      // van hier rechtstreeks /api/knowledge-drafts aan te roepen.
      const res = await fetch("/api/creator/approve-knowledge-draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailDraftId: mail.id,
          title: kennisstukVoorstel.title,
          question: kennisstukVoorstel.question,
          shortAnswer: kennisstukVoorstel.shortAnswer,
          fullAnswer: kennisstukVoorstel.fullAnswer,
          customerSpecificInformationFound: kennisstukVoorstel.customerSpecificInformationFound,
          customerSpecificInformationExplanation: kennisstukVoorstel.customerSpecificInformationExplanation,
        }),
      });
      const data = await json<{ id: number }>(res);
      toast.success("Kennisstuk aangemaakt — staat klaar ter beoordeling bij Knowledge Drafts.");
      window.open(`/admin/collections/knowledge-drafts/${data.id}`, "_blank");
      setKennisstukVoorstel(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kennisstuk opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }

  if (!mail) return <div className="ml-creator">Laden...</div>;

  return (
    <div className="ml-creator">
      <h1 className="ml-creator__title">Mail schrijven</h1>

      <div className="ml-creator__mail-kolommen">
        <div>
          <h2>Ontvangen mail</h2>
          <textarea className="ml-creator__editor" rows={12} value={ontvangenTekst} onChange={(e) => setOntvangenTekst(e.target.value)} placeholder="Plak hier de ontvangen mail..." />
          <Button buttonStyle="primary" size="small" disabled={bezig || !ontvangenTekst.trim()} onClick={genereerAntwoord}>
            {bezig ? "Bezig..." : "AI helpt met antwoord"}
          </Button>
        </div>

        <div>
          <h2>Conceptantwoord</h2>
          <textarea className="ml-creator__editor" rows={12} value={conceptAntwoord} onChange={(e) => setConceptAntwoord(e.target.value)} placeholder="Het conceptantwoord verschijnt hier — je kunt het zelf aanpassen." />
          <div className="ml-creator__editor-acties">
            <Button buttonStyle="secondary" size="small" disabled={bezig} onClick={slaMailOp}>
              Bewaren als concept
            </Button>
            <Button buttonStyle="secondary" size="small" disabled={bezig || !conceptAntwoord.trim()} onClick={maakKennisstukVoorstel}>
              Maak hier een kennisstuk van
            </Button>
          </div>
        </div>
      </div>

      {kennisstukVoorstel && (
        <div className="ml-creator__kennisstuk-voorstel">
          <h2>Kennisstukvoorstel</h2>
          <p>
            <strong>Titel:</strong> {kennisstukVoorstel.title}
          </p>
          <p>
            <strong>Vraag:</strong> {kennisstukVoorstel.question}
          </p>
          <p>
            <strong>Antwoord:</strong> {kennisstukVoorstel.fullAnswer}
          </p>
          {kennisstukVoorstel.customerSpecificInformationFound && (
            <p className="ml-creator__kennisstuk-waarschuwing">
              Let op: mogelijk klantspecifieke informatie in de brontekst — controleer voor het goedkeuren. {kennisstukVoorstel.customerSpecificInformationExplanation}
            </p>
          )}
          <Button buttonStyle="primary" size="small" disabled={bezig || isNieuw} onClick={keurKennisstukGoed}>
            Goedkeuren en opslaan
          </Button>
          {isNieuw && <p>Bewaar het mailconcept eerst voordat je het kennisstuk goedkeurt.</p>}
        </div>
      )}
    </div>
  );
}
