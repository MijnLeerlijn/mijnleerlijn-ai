"use client";

import { useState, type ReactNode } from "react";
import { FileText, Search as SearchIcon } from "lucide-react";
import Button from "@/components/atoms/Button";
import IconButton from "@/components/atoms/IconButton";
import Link from "@/components/atoms/Link";
import Input from "@/components/atoms/Input";
import Textarea from "@/components/atoms/Textarea";
import Label from "@/components/atoms/Label";
import Badge from "@/components/atoms/Badge";
import Chip from "@/components/atoms/Chip";
import Divider from "@/components/atoms/Divider";
import GradientAccent from "@/components/atoms/GradientAccent";
import Spinner from "@/components/atoms/Spinner";
import Skeleton from "@/components/atoms/Skeleton";
import VisuallyHidden from "@/components/atoms/VisuallyHidden";
import CategorieIcoon from "@/components/atoms/CategorieIcoon";

import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import ArticleMeta from "@/components/molecules/ArticleMeta";
import SourceCard from "@/components/molecules/SourceCard";
import UpdateCard from "@/components/molecules/UpdateCard";
import RecentCard from "@/components/molecules/RecentCard";
import ContactField from "@/components/molecules/ContactField";
import FormMessage from "@/components/molecules/FormMessage";
import EmptyState from "@/components/molecules/EmptyState";
import ErrorMessage from "@/components/molecules/ErrorMessage";
import Pagination from "@/components/molecules/Pagination";
import FeedbackControl from "@/components/molecules/FeedbackControl";
import KennisKaart from "@/components/molecules/KennisKaart";

import AnswerPanel from "@/components/organisms/AnswerPanel";
import AnswerSources from "@/components/organisms/AnswerSources";
import NoAnswerState from "@/components/organisms/NoAnswerState";
import SearchPanel from "@/components/organisms/SearchPanel";
import ArticleHeader from "@/components/organisms/ArticleHeader";
import ArticleContent from "@/components/organisms/ArticleContent";
import RelatedArticles from "@/components/organisms/RelatedArticles";
import CategoryOverview from "@/components/organisms/CategoryOverview";
import ContactForm from "@/components/organisms/ContactForm";

import { useToast } from "@/providers/ToastProvider";
import {
  vindArtikel,
  gerelateerdeArtikelen as vindGerelateerdeArtikelen,
  artikelenPerCategorie,
} from "@/lib/data";
import { populaireVragen } from "@/lib/data/popular-questions";
import { formatDatumNL } from "@/lib/format/date";

const artikel = vindArtikel("doelenset-koppelen-aan-leerlingen")!;
const gerelateerdeArtikelen = vindGerelateerdeArtikelen(artikel).map((a) => ({
  titel: a.title,
  sectie: a.sections[0]?.title ?? "",
  laatstBijgewerkt: formatDatumNL(a.lastContentUpdate),
  href: `/artikel/${a.slug}`,
}));
const antwoordMeerdereBronnen = populaireVragen[2]!;
const antwoordMeerdereBronnenProps = {
  tekst: antwoordMeerdereBronnen.antwoord,
  bronnen: antwoordMeerdereBronnen.bronnen.map((b) => ({
    titel: b.titel,
    sectie: b.sectie,
    datum: formatDatumNL(b.datum),
  })),
};
const doelenPlanningArtikelen = artikelenPerCategorie("doelen-planning");
const categorieOverzichtArtikelen = doelenPlanningArtikelen.map((a) => ({
  titel: a.title,
  samenvatting: a.sections[0]?.title ?? "",
  laatstBijgewerkt: formatDatumNL(a.lastContentUpdate),
  href: `/artikel/${a.slug}`,
  tags: a.tags,
}));
const categorieOverzichtSubcategorieen = Array.from(new Set(doelenPlanningArtikelen.flatMap((a) => a.tags)));

function Section({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section id={titel.toLowerCase().replace(/\s+/g, "-")} className="border-b border-grijs-100 py-10">
      <h2 className="text-h2 font-semibold text-grijs-900">{titel}</h2>
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.04em] text-grijs-400">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const LANG_TITEL =
  "Automatisch alle doelensets koppelen aan nieuwe leerlingen binnen een groep zonder individuele koppeling";

export default function ComponentsDevPage() {
  const { showToast } = useToast();
  const [pagina, setPagina] = useState(2);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40 border-b border-grijs-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-8">
        <p className="text-sm font-semibold text-grijs-900">
          /dev/components — alleen in development, geen onderdeel van het echte product
        </p>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        {/* ATOMS ------------------------------------------------------- */}
        <Section titel="Atoms — Button">
          <Row label="Varianten (standaard)">
            <Button variant="primary">Primair</Button>
            <Button variant="secondary">Secundair</Button>
            <Button variant="tertiary">Tertiair</Button>
            <Button variant="destructive">Destructief</Button>
          </Row>
          <Row label="Groottes">
            <Button size="compact">Compact</Button>
            <Button size="standaard">Standaard</Button>
            <Button size="groot">Groot</Button>
          </Row>
          <Row label="Staten">
            <Button>Default</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Row>
        </Section>

        <Section titel="Atoms — IconButton">
          <Row label="Standaard / compact / onDark">
            <IconButton icon={SearchIcon} aria-label="Zoeken" className="text-grijs-600 hover:text-blauw" />
            <IconButton
              icon={SearchIcon}
              aria-label="Zoeken (compact)"
              boxSize="compact"
              className="text-grijs-600 hover:text-blauw"
            />
            <div className="rounded-md bg-donkerblauw p-2">
              <IconButton icon={SearchIcon} aria-label="Zoeken op donker" onDark className="text-white" />
            </div>
            <IconButton icon={SearchIcon} aria-label="Uitgeschakeld" disabled className="text-grijs-600" />
          </Row>
        </Section>

        <Section titel="Atoms — Link">
          <Row label="Standaard / onDark / underline=always">
            <Link href="#">Ondergeschikte link</Link>
            <div className="rounded-md bg-donkerblauw p-2">
              <Link href="#" onDark>
                Link op donker
              </Link>
            </div>
            <Link href="#" underline="always">
              Altijd onderstreept
            </Link>
          </Row>
        </Section>

        <Section titel="Atoms — Input / Textarea / Label">
          <Row label="Input: default / error / disabled">
            <Input placeholder="Gewoon veld" className="w-56" />
            <Input placeholder="Foutstaat" error className="w-56" />
            <Input placeholder="Uitgeschakeld" disabled className="w-56" />
          </Row>
          <Row label="Textarea + Label (verplicht)">
            <div className="w-72">
              <Label htmlFor="dev-textarea" required>
                Voorbeeldlabel
              </Label>
              <Textarea id="dev-textarea" placeholder="Lange tekst..." />
            </div>
          </Row>
        </Section>

        <Section titel="Atoms — Badge / Chip / Divider / GradientAccent">
          <Row label="Badge — alle tones">
            <Badge tone="success">Nieuw</Badge>
            <Badge tone="info">Bijgewerkt</Badge>
            <Badge tone="warning">Let op</Badge>
            <Badge tone="error">Fout</Badge>
            <Badge tone="neutral">Concept</Badge>
          </Row>
          <Row label="Chip — interactief / geselecteerd / tag (niet-interactief)">
            <Chip onClick={() => undefined}>Klikbaar</Chip>
            <Chip selected onClick={() => undefined}>
              Geselecteerd
            </Chip>
            <Chip>Niet-interactieve tag</Chip>
          </Row>
          <Row label="Divider / GradientAccent">
            <div className="flex w-64 items-center gap-3">
              <span className="text-sm text-grijs-600">links</span>
              <Divider className="flex-1" />
              <span className="text-sm text-grijs-600">rechts</span>
            </div>
            <GradientAccent className="w-32" />
          </Row>
        </Section>

        <Section titel="Atoms — Spinner / Skeleton / VisuallyHidden">
          <Row label="Spinner / Skeleton-varianten">
            <Spinner />
            <Skeleton variant="tekst" className="w-40" />
            <Skeleton variant="rij" className="w-40" />
            <Skeleton variant="kaart" className="w-40" />
          </Row>
          <Row label="VisuallyHidden (alleen zichtbaar voor screenreaders — hier gemarkeerd)">
            <span className="rounded border border-dashed border-grijs-300 p-2 text-sm text-grijs-600">
              icoon{" "}
              <VisuallyHidden>(extra screenreader-tekst hoort hier, visueel onzichtbaar)</VisuallyHidden>
            </span>
          </Row>
        </Section>

        {/* MOLECULES ---------------------------------------------------- */}
        <Section titel="Molecules — navigatie & metadata">
          <Row label="Breadcrumbs">
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Doelen & Planning", href: "#" },
                { label: "Doelenset aanmaken" },
              ]}
            />
          </Row>
          <Row label="ArticleMeta">
            <ArticleMeta categorie="Doelen & Planning" laatstBijgewerkt="14 mei 2026" />
          </Row>
        </Section>

        <Section titel="Molecules — kaarten">
          <Row label="SourceCard / KennisKaart">
            <div className="w-72">
              <SourceCard
                titel="Doelenset koppelen aan leerlingen"
                sectie="Een doelenset koppelen"
                datum="14 mei 2026"
              />
            </div>
            <div className="w-56">
              <KennisKaart titel="Doelen & Planning" icoon="Target" kleur="blauw" href="#" />
            </div>
          </Row>
          <Row label="UpdateCard / RecentCard">
            <div className="w-64">
              <UpdateCard titel="Vaardighedensets toevoegen" badge="Nieuw" datum="2 mei 2026" href="#" />
            </div>
            <div className="w-64">
              <RecentCard
                titel="Doelenset aanmaken"
                sectie="Een nieuwe doelenset starten"
                bekekenOp="2 dagen geleden"
                href="#"
              />
            </div>
          </Row>
          <Row label="Lange titel (tekstoverloop-test)">
            <div className="w-64">
              <UpdateCard titel={LANG_TITEL} badge="Bijgewerkt" datum="14 mei 2026" href="#" />
            </div>
            <div className="w-72">
              <SourceCard
                titel={LANG_TITEL}
                sectie="Een sectie met een ook best lange naam voor deze context"
                datum="14 mei 2026"
              />
            </div>
          </Row>
        </Section>

        <Section titel="Molecules — formulier">
          <Row label="ContactField: default / error">
            <div className="w-64">
              <ContactField label="Naam leerkracht" name="naam-demo" placeholder="Voor- en achternaam" />
            </div>
            <div className="w-64">
              <ContactField label="E-mail" name="email-demo" error="Vul een geldig e-mailadres in" />
            </div>
          </Row>
          <Row label="FormMessage — alle tones">
            <FormMessage tone="error">Dit veld is verplicht</FormMessage>
            <FormMessage tone="success">Opgeslagen</FormMessage>
            <FormMessage tone="info">Extra toelichting</FormMessage>
          </Row>
        </Section>

        <Section titel="Molecules — status & feedback">
          <Row label="EmptyState">
            <EmptyState
              icon={FileText}
              titel="Nog geen artikelen"
              beschrijving="Gebruik de zoekbalk of stel je vraag."
            />
          </Row>
          <Row label="ErrorMessage (met en zonder retry)">
            <ErrorMessage beschrijving="De pagina kon niet volledig geladen worden." />
            <ErrorMessage beschrijving="Zoeken lukt nu niet." onRetry={() => undefined} />
          </Row>
          <Row label="Pagination (interactief)">
            <Pagination huidigePagina={pagina} totaalPaginas={5} onPaginaWijzigen={setPagina} />
          </Row>
          <Row label="FeedbackControl">
            <FeedbackControl />
          </Row>
          <Row label="Toast (via ToastProvider, rechtsonder in beeld)">
            <Button variant="secondary" onClick={() => showToast("succes", "Dit is een voorbeeldmelding.")}>
              Toon toast
            </Button>
          </Row>
        </Section>

        {/* ORGANISMS ------------------------------------------------- */}
        <Section titel="Organisms — Header, Footer, MobileNavigation">
          <p className="text-sm text-grijs-600">
            Header en Footer zijn te bekijken op de <Link href="/">homepage</Link> — daar zijn ze al onderdeel
            van PublicLayout. MobileNavigation is onderdeel van Header (open het menu op een smal scherm).
          </p>
        </Section>

        <Section titel="Organisms — Antwoordervaring (echte invoer → simulatie → resultaat)">
          <Row label="Live demo">
            <Link href="/">Bekijk de zoekervaring live op de homepage</Link>
          </Row>
          <div className="rounded-lg bg-donkerblauw p-6">
            <SearchPanel />
          </div>
        </Section>

        <Section titel="Organisms — AnswerSources / AnswerPanel / NoAnswerState (los)">
          <Row label="AnswerSources">
            <div className="w-96">
              <AnswerSources bronnen={antwoordMeerdereBronnenProps.bronnen} />
            </div>
          </Row>
          <Row label="AnswerPanel (op lichte achtergrond, ter vergelijking)">
            <div className="w-[560px] max-w-full">
              <AnswerPanel {...antwoordMeerdereBronnenProps} />
            </div>
          </Row>
          <Row label="NoAnswerState">
            <div className="w-[560px] max-w-full">
              <NoAnswerState gerelateerd={["Leerling verwijderen uit groep", "Rapportage-instellingen"]} />
            </div>
          </Row>
        </Section>

        <Section titel="Organisms — Artikel (ArticleHeader, ArticleContent, RelatedArticles)">
          <div className="max-w-[680px]">
            <ArticleHeader
              titel={artikel.title}
              categorie={artikel.category}
              laatstBijgewerkt={formatDatumNL(artikel.lastContentUpdate)}
            />
            <ArticleContent secties={artikel.sections.slice(0, 1)} />
            <RelatedArticles artikelen={gerelateerdeArtikelen} />
          </div>
        </Section>

        <Section titel="Organisms — CategoryOverview">
          <CategoryOverview
            categorieTitel="Doelen & Planning"
            categorieUitleg="Alles over het aanmaken, koppelen en beheren van doelensets."
            subcategorieen={categorieOverzichtSubcategorieen}
            artikelen={categorieOverzichtArtikelen}
          />
          <Row label="Lege staat">
            <div className="w-full">
              <CategoryOverview
                categorieTitel="Nog leeg onderwerp"
                categorieUitleg="Voorbeeld van de lege staat."
                subcategorieen={["Alle onderwerpen"]}
                artikelen={[]}
              />
            </div>
          </Row>
        </Section>

        <Section titel="Organisms — ContactForm">
          <ContactForm />
        </Section>

        <Section titel="Edge cases — lange Nederlandse woorden & ontbrekende data">
          <Row label="Categorie-icoon met onbekende naam (valt terug op FileText)">
            <CategorieIcoon naam="OnbekendIcoon" kleur="blauw" />
            <CategorieIcoon naam="Target" kleur="rood" />
          </Row>
          <Row label="Lang woord in een smalle kaart">
            <div className="w-40">
              <KennisKaart
                titel="Onvindbaarheidsregistratieformulieren"
                icoon="Target"
                kleur="groen"
                href="#"
              />
            </div>
          </Row>
        </Section>
      </div>
    </div>
  );
}
