"use client";

import { Suspense, useCallback, useEffect, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Link, SelectInput, TextInput, toast } from "@payloadcms/ui";
import {
  BookOpen,
  Laptop,
  Mail,
  Sparkles,
  FileText,
  Search,
  Plus,
  X,
  Send,
  Rss,
  BrainCircuit,
  GraduationCap,
  Share2,
  Newspaper,
  Building2,
  Handshake,
  MessageSquare,
  TriangleAlert,
  Save,
  type LucideIcon,
} from "lucide-react";
import type { ContextItem } from "@/lib/assistant/build-context";
import type { CreatorChatBericht } from "@/lib/creator/creator-chat";
import type { AfgeleideKanaal } from "@/lib/creator/derive-channel";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";

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
// opslaglaag. Alleen de AI-aanroepen zelf lopen via de app/api/creator/*-
// routes (die op hun beurt lib/creator/* aanroepen).
//
// UX/visual-polish (2026-08-13): kleuren/iconen hergebruiken bewust
// hetzelfde 9-kleurenpalet + --item-fg/--item-bg-mechanisme als
// nav-groups.ts/BeheerNavLinks.tsx/BeheerDashboard.tsx (NAV_COLOR_STYLES) —
// geen tweede, losse kleurdefinitie. "+ Kennis toevoegen" bij de
// artikel-chat is een ECHTE zoek-en-pin-actie (creatorChat() ondersteunt
// gepindeKnowledgeSourceIds al server-side, zie lib/creator/creator-chat.ts)
// — bij Mail schrijven bestaat die pin-mogelijkheid niet in
// schrijfMailAntwoord(), dus daar bewust GEEN "+ Kennis toevoegen"-knop
// (geen nepfunctionaliteit), alleen de al door de API geretourneerde
// "Gebruikte kennis" zichtbaar gemaakt.

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

interface KennisbronOptie {
  id: number;
  title: string;
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

/** Kleur-chip voor een icoon — hergebruikt NAV_COLOR_STYLES (nav-colors.ts), geen los kleursysteem. */
function IconChip({ icon: Icon, kleur, size = 22 }: { icon: LucideIcon; kleur: NavColor; size?: number }) {
  const stijl = NAV_COLOR_STYLES[kleur];
  return (
    <div className="ml-creator__icon-chip" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
      <Icon size={size} aria-hidden="true" />
    </div>
  );
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

const ROUTE_BESCHRIJVING: Record<
  CreatorRoute,
  { titel: string; tekst: string; knowledgeType: "product" | "pedagogisch"; kleur: NavColor; icon: LucideIcon; actieLabel: string }
> = {
  inhoudelijk: {
    titel: "Inhoudelijk artikel",
    tekst: "Schrijf samen met AI over onderwijs, curriculum, kerndoelen, visie of een ander inhoudelijk onderwerp.",
    knowledgeType: "pedagogisch",
    kleur: "blue",
    icon: BookOpen,
    actieLabel: "Start artikel",
  },
  software: {
    titel: "MijnLeerlijn / software",
    tekst: "Maak uitleg, tips of een artikel over een bestaande of nieuwe functionaliteit. De AI gebruikt hierbij de bestaande productkennis.",
    knowledgeType: "product",
    kleur: "purple",
    icon: Laptop,
    actieLabel: "Start softwareartikel",
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
      <p className="ml-creator__subtitle">Kies een startpunt — de AI schrijft mee, jij houdt de regie.</p>

      <div className="ml-creator__routes">
        {(Object.keys(ROUTE_BESCHRIJVING) as CreatorRoute[]).map((route) => {
          const info = ROUTE_BESCHRIJVING[route];
          return (
            <div className="ml-creator__route-card" key={route} style={{ "--item-fg": NAV_COLOR_STYLES[info.kleur].fg } as CSSProperties}>
              <IconChip icon={info.icon} kleur={info.kleur} />
              <h2>{info.titel}</h2>
              <p>{info.tekst}</p>
              {actieveRoute === route ? (
                <div className="ml-creator__route-start">
                  <TextInput path="titel" label="Titel" value={titel} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitel(e.target.value)} placeholder="Bijv. Doelen plannen" />
                  <Button buttonStyle="primary" size="small" disabled={bezig || !titel.trim()} onClick={() => startArtikel(route, Date.now().toString(36))}>
                    {bezig ? "Bezig..." : "Start"}
                  </Button>
                </div>
              ) : (
                <Button
                  buttonStyle="primary"
                  size="small"
                  className="ml-creator__route-actie"
                  onClick={() => {
                    setActieveRoute(route);
                    setTitel("");
                  }}
                >
                  {info.actieLabel}
                </Button>
              )}
            </div>
          );
        })}

        <div className="ml-creator__route-card" style={{ "--item-fg": NAV_COLOR_STYLES.teal.fg } as CSSProperties}>
          <IconChip icon={Mail} kleur="teal" />
          <h2>Mail schrijven</h2>
          <p>Schrijf een inhoudelijke reactie op een mail met gebruik van de MijnLeerlijn-kennisbasis.</p>
          <Link href="/admin/creator?mail=nieuw" className="ml-creator__route-link">
            <Button buttonStyle="primary" size="small" el="div" className="ml-creator__route-actie">
              Schrijf een mail
            </Button>
          </Link>
        </div>
      </div>

      <div className="ml-creator__recent">
        <h2>Verder met...</h2>
        {recent === null && <p className="ml-creator__muted">Laden...</p>}
        {recent !== null && recent.length === 0 && <p className="ml-creator__muted">Nog niets om verder mee te gaan — kies hierboven een route om te beginnen.</p>}
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

const KANAAL_META: Record<AfgeleideKanaal, { label: string; icon: LucideIcon; kleur: NavColor }> = {
  nieuwsbrief: { label: "Nieuwsbrief", icon: Newspaper, kleur: "orange" },
  linkedin: { label: "LinkedIn", icon: Building2, kleur: "blue" },
  partnertekst: { label: "Partnertekst", icon: Handshake, kleur: "green" },
};

function Werkruimte({ artikelId }: { artikelId: string }) {
  const [artikel, setArtikel] = useState<ArtikelDoc | null>(null);
  const [documentTekst, setDocumentTekst] = useState("");
  const [opslaan, setOpslaan] = useState(false);

  const [berichten, setBerichten] = useState<CreatorChatBericht[]>([]);
  const [chatInvoer, setChatInvoer] = useState("");
  const [chatBezig, setChatBezig] = useState(false);
  const [gebruikteKennis, setGebruikteKennis] = useState<ContextItem[]>([]);

  const [kennisZoekterm, setKennisZoekterm] = useState("");
  const [kennisResultaten, setKennisResultaten] = useState<KennisbronOptie[] | null>(null);
  const [kennisZoekBezig, setKennisZoekBezig] = useState(false);
  const [gepindeKennis, setGepindeKennis] = useState<KennisbronOptie[]>([]);

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
          gepindeKnowledgeSourceIds: gepindeKennis.map((k) => k.id),
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

  async function zoekKennis() {
    const zoekterm = kennisZoekterm.trim();
    if (!zoekterm) return;
    setKennisZoekBezig(true);
    try {
      const res = await fetch(`/api/knowledge-sources?where[title][contains]=${encodeURIComponent(zoekterm)}&limit=6&depth=0`, { credentials: "include" });
      const data = await json<{ docs: { id: number; title: string }[] }>(res);
      setKennisResultaten(data.docs.map((d) => ({ id: d.id, title: d.title })));
    } catch {
      // Kennisbronnen zijn admin-only leesbaar — voor een redacteur is dit
      // niet te onderscheiden van "niets gevonden"; geen alarmerende toast
      // voor een secundaire, optionele actie.
      setKennisResultaten([]);
    } finally {
      setKennisZoekBezig(false);
    }
  }

  function kennisZoekToetsenbord(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      zoekKennis();
    }
  }

  function pinKennis(item: KennisbronOptie) {
    setGepindeKennis((huidig) => (huidig.some((k) => k.id === item.id) ? huidig : [...huidig, item]));
    setKennisZoekterm("");
    setKennisResultaten(null);
  }

  function verwijderGepindeKennis(id: number) {
    setGepindeKennis((huidig) => huidig.filter((k) => k.id !== id));
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
        <div className="ml-creator__kolom-header ml-creator__kolom-header--purple">
          <Sparkles size={18} aria-hidden="true" />
          <div>
            <h2>AI-assistent</h2>
            <p>Schrijft mee aan je document</p>
          </div>
        </div>

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
        <Button buttonStyle="primary" size="small" disabled={chatBezig || !chatInvoer.trim()} onClick={stuurChatBericht} icon={<Send size={14} />} iconPosition="left">
          {chatBezig ? "Bezig..." : "Versturen"}
        </Button>

        <div className="ml-creator__gebruikte-kennis">
          <h3>
            <BookOpen size={13} aria-hidden="true" /> Gebruikte kennis
          </h3>
          {gebruikteKennis.length === 0 ? (
            <p className="ml-creator__muted">Nog geen kennis opgehaald.</p>
          ) : (
            <ul>
              {gebruikteKennis.map((k) => (
                <li key={`${k.refCollection}-${k.refId}`}>{k.title}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="ml-creator__kennis-toevoegen">
          <h3>
            <Plus size={13} aria-hidden="true" /> Kennis toevoegen
          </h3>
          <div className="ml-creator__kennis-zoek">
            <input
              type="text"
              value={kennisZoekterm}
              onChange={(e) => setKennisZoekterm(e.target.value)}
              onKeyDown={kennisZoekToetsenbord}
              placeholder="Zoek een kennisbron..."
            />
            <button type="button" onClick={zoekKennis} disabled={kennisZoekBezig || !kennisZoekterm.trim()} aria-label="Zoeken">
              <Search size={14} aria-hidden="true" />
            </button>
          </div>
          {kennisResultaten !== null && (
            <ul className="ml-creator__kennis-resultaten">
              {kennisResultaten.length === 0 && <li className="ml-creator__muted">Niets gevonden.</li>}
              {kennisResultaten.map((r) => (
                <li key={r.id}>
                  <span>{r.title}</span>
                  <button type="button" onClick={() => pinKennis(r)} aria-label={`${r.title} toevoegen`}>
                    <Plus size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {gepindeKennis.length > 0 && (
            <div className="ml-creator__kennis-chips">
              {gepindeKennis.map((k) => (
                <span key={k.id} className="ml-creator__kennis-chip">
                  {k.title}
                  <button type="button" onClick={() => verwijderGepindeKennis(k.id)} aria-label={`${k.title} verwijderen`}>
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ml-creator__kolom ml-creator__kolom--editor">
        <div className="ml-creator__document-titel">
          <FileText size={20} aria-hidden="true" />
          <h2>{artikel.title}</h2>
        </div>
        <div className="ml-creator__document-shell">
          <div className="ml-creator__document-shell-label">Document</div>
          <textarea className="ml-creator__editor" value={documentTekst} onChange={(e) => setDocumentTekst(e.target.value)} rows={20} />
        </div>
        <div className="ml-creator__editor-acties">
          <Button buttonStyle="primary" size="small" disabled={opslaan} onClick={slaDocumentOp} icon={<Save size={14} />} iconPosition="left">
            {opslaan ? "Opslaan..." : "Opslaan"}
          </Button>
          <Link href={`/admin/collections/articles/${artikel.id}`}>
            <Button buttonStyle="secondary" size="small" el="div">
              Volledig bewerken
            </Button>
          </Link>
        </div>
      </div>

      <div className="ml-creator__kolom ml-creator__kolom--rechts">
        <section className="ml-creator__actiekaart">
          <h3>
            <Rss size={14} aria-hidden="true" /> Publicatie
          </h3>
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

        <section className="ml-creator__actiekaart">
          <h3>
            <BrainCircuit size={14} aria-hidden="true" /> AI-kennis
          </h3>
          <Button buttonStyle={artikel.aiKnowledgeStatus === "actief" ? "primary" : "secondary"} size="small" onClick={() => slaOp({ aiKnowledgeStatus: artikel.aiKnowledgeStatus === "actief" ? "uit" : "actief" })}>
            {artikel.aiKnowledgeStatus === "actief" ? "Gebruikt als kennis voor Helpdesk-AI — uitzetten" : "Gebruik als kennis voor Helpdesk-AI"}
          </Button>
        </section>

        <section className="ml-creator__actiekaart">
          <h3>
            <GraduationCap size={14} aria-hidden="true" /> Onderwijsvarianten
          </h3>
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

        <section className="ml-creator__actiekaart">
          <h3>
            <Share2 size={14} aria-hidden="true" /> Maak hiervan
          </h3>
          <div className="ml-creator__kanaal-knoppen">
            {(Object.keys(KANAAL_META) as AfgeleideKanaal[]).map((channel) => {
              const meta = KANAAL_META[channel];
              return (
                <button
                  key={channel}
                  type="button"
                  className="ml-creator__kanaal-knop"
                  style={{ "--item-fg": NAV_COLOR_STYLES[meta.kleur].fg, "--item-bg": NAV_COLOR_STYLES[meta.kleur].bg } as CSSProperties}
                  disabled={kanaalBezig === channel}
                  onClick={() => maakAfgeleideContent(channel)}
                >
                  <meta.icon size={16} aria-hidden="true" />
                  {kanaalBezig === channel ? "Bezig..." : meta.label}
                </button>
              );
            })}
          </div>
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
  const [instructie, setInstructie] = useState("");
  const [mailTekst, setMailTekst] = useState("");
  const [gebruikteKennis, setGebruikteKennis] = useState<{ titel: string; tekst: string }[]>([]);
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
        setMailTekst(doc.draftReply ?? "");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Mailconcept laden mislukt.");
      }
    })();
  }, [mailId, isNieuw]);

  async function schrijfMail() {
    if (!instructie.trim()) return;
    setBezig(true);
    try {
      const res = await fetch("/api/creator/mail-reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ontvangenTekst: ontvangenTekst.trim() || undefined, instructie }),
      });
      const data = await json<{ conceptAntwoord: string; gebruikteKennis: { titel: string; tekst: string }[] }>(res);
      setMailTekst(data.conceptAntwoord);
      setGebruikteKennis(data.gebruikteKennis);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mail schrijven mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function slaMailOp() {
    setBezig(true);
    try {
      const body = JSON.stringify({
        subject: (ontvangenTekst || instructie).slice(0, 80) || "Mailconcept",
        receivedText: ontvangenTekst,
        draftReply: mailTekst,
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
    if (!mailTekst.trim()) return;
    setBezig(true);
    try {
      const res = await fetch("/api/creator/mail-to-knowledge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ontvangenTekst: ontvangenTekst || instructie, conceptAntwoord: mailTekst }),
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
    <div className="ml-creator ml-creator--mail">
      <h1 className="ml-creator__title">Mail schrijven</h1>
      <p className="ml-creator__subtitle">Vertel wat je wilt zeggen — de AI gebruikt dat, de eventuele ontvangen mail en de MijnLeerlijn-kennis om een mail te schrijven.</p>

      <div className="ml-creator__mail-layout">
        <div className="ml-creator__kolom ml-creator__kolom--mail-input">
          <div className="ml-creator__kolom-header">
            <Mail size={16} aria-hidden="true" />
            <div>
              <h2>Ontvangen mail</h2>
              <p>Optioneel</p>
            </div>
          </div>
          <textarea
            className="ml-creator__editor ml-creator__editor--klein"
            rows={9}
            value={ontvangenTekst}
            onChange={(e) => setOntvangenTekst(e.target.value)}
            placeholder="Plak hier eventueel de mail waarop je wilt reageren..."
          />
        </div>

        <div className="ml-creator__kolom ml-creator__kolom--mail-input">
          <div className="ml-creator__kolom-header ml-creator__kolom-header--blue">
            <MessageSquare size={16} aria-hidden="true" />
            <div>
              <h2>Wat wil ik zeggen?</h2>
              <p>Stuurt de AI direct</p>
            </div>
          </div>
          <textarea
            className="ml-creator__editor ml-creator__editor--klein"
            rows={9}
            value={instructie}
            onChange={(e) => setInstructie(e.target.value)}
            placeholder="Vertel de AI wat je wilt antwoorden. Bijvoorbeeld: bedank voor de interesse, leg uit hoe Montessori werkt en stel voor om een demo in te plannen..."
          />
          <Button buttonStyle="primary" size="small" disabled={bezig || !instructie.trim()} onClick={schrijfMail} icon={<Sparkles size={14} />} iconPosition="left">
            {bezig ? "Bezig..." : "Schrijf mijn mail"}
          </Button>
        </div>

        <div className="ml-creator__kolom ml-creator__kolom--mail-output">
          <div className="ml-creator__kolom-header ml-creator__kolom-header--purple">
            <FileText size={16} aria-hidden="true" />
            <div>
              <h2>Mail om te versturen</h2>
              <p>Door AI gegenereerd — blijft handmatig bewerkbaar</p>
            </div>
          </div>
          <div className="ml-creator__document-shell">
            <textarea
              className="ml-creator__editor"
              rows={12}
              value={mailTekst}
              onChange={(e) => setMailTekst(e.target.value)}
              placeholder="Het resultaat van 'Schrijf mijn mail' verschijnt hier — je kunt het zelf aanpassen."
            />
          </div>
          <div className="ml-creator__editor-acties">
            <Button buttonStyle="secondary" size="small" disabled={bezig} onClick={slaMailOp}>
              Bewaren als concept
            </Button>
            <Button buttonStyle="secondary" size="small" disabled={bezig || !mailTekst.trim()} onClick={maakKennisstukVoorstel}>
              Maak hier een kennisstuk van
            </Button>
          </div>

          <div className="ml-creator__gebruikte-kennis">
            <h3>
              <BookOpen size={13} aria-hidden="true" /> Gebruikte kennis
            </h3>
            {gebruikteKennis.length === 0 ? (
              <p className="ml-creator__muted">Nog geen kennis opgehaald — verschijnt hier na &ldquo;Schrijf mijn mail&rdquo;.</p>
            ) : (
              <ul>
                {gebruikteKennis.map((k) => (
                  <li key={k.titel}>{k.titel}</li>
                ))}
              </ul>
            )}
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
              <TriangleAlert size={14} aria-hidden="true" />
              Let op: mogelijk klantspecifieke informatie in de brontekst — controleer voor het goedkeuren. {kennisstukVoorstel.customerSpecificInformationExplanation}
            </p>
          )}
          <Button buttonStyle="primary" size="small" disabled={bezig || isNieuw} onClick={keurKennisstukGoed}>
            Goedkeuren en opslaan
          </Button>
          {isNieuw && <p className="ml-creator__muted">Bewaar het mailconcept eerst voordat je het kennisstuk goedkeurt.</p>}
        </div>
      )}
    </div>
  );
}
