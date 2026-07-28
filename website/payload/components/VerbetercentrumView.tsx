"use client";

import { Fragment, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Button, CheckboxInput, Gutter, SelectInput, TextInput, toast } from "@payloadcms/ui";
import {
  buildFilterWhereParams,
  STANDAARD_FILTERS,
  type VerbetercentrumFilterState,
} from "@/lib/verbetercentrum/build-filter-where";
import type { VerbetercentrumStats } from "@/lib/verbetercentrum/compute-stats";

// AI Verbetercentrum (2026-07-27): centraal scherm om elke helpdeskvraag te
// begrijpen ("waarom kwam de AI tot dit antwoord?") en direct om te zetten
// in kennisbasis-verbeteringen. Zelfde architectuurpatroon als
// DownloadbeheerView.tsx (client component, REST-fetch naar Payload's eigen
// API, @payloadcms/ui-componenten) — met één belangrijk verschil:
// assistant-conversations staat create/update ONVOORWAARDELIJK dicht (zie
// AssistantConversations.ts), dus elke schrijfactie hieronder loopt via een
// eigen, admin-gecontroleerde route onder app/api/verbetercentrum/*, niet
// via een rechtstreekse PATCH zoals Downloadbeheer dat wel kan.

const PAGINA_GROOTTE = 25;

interface KennisbasisOnderwerpRef {
  id: number;
  onderwerp: string;
  officieleTerm?: string;
}

interface BronVermelding {
  label: string;
  refCollection: string;
  refId: number;
  title: string;
  chapterTitle?: string | null;
  similarity: number;
  url: string;
}

interface StapVermelding {
  handleidingId: number;
  stepId: string;
  stepNummer: number;
}

interface ConversatieDoc {
  id: number;
  question: string;
  previousQuestion?: string | null;
  hasAnswer: boolean;
  answer: string;
  reasoning?: string | null;
  confidence: number;
  sources?: BronVermelding[] | null;
  steps?: StapVermelding[] | null;
  feedbackRating: "geen" | "nuttig" | "niet_nuttig";
  contactFormSubmitted?: boolean | null;
  geenHandleidingGevonden?: boolean | null;
  intentieType?: "opgelost" | "onduidelijk" | "geen-match" | null;
  kennisbasisOnderwerp?: number | KennisbasisOnderwerpRef | null;
  kennisbasisKandidaten?: (number | KennisbasisOnderwerpRef)[] | null;
  gebruikteOfficieleTerm?: string | null;
  gebruikteSynoniem?: string | null;
  verbeterStatus: "nieuw" | "beoordeeld" | "opgelost" | "genegeerd";
  // Kennisbasis MijnLeerlijn — Fase 4 (2026-07-28)
  centraleKennisbasisGebruikt?: boolean | null;
  centraleKennisbasisVersion?: string | null;
  tegenstrijdigheid?: string | null;
  createdAt: string;
}

interface OnderwerpOptie {
  id: number;
  onderwerp: string;
}

interface HandleidingOptie {
  relationTo: "handleidingen" | "knowledge-sources";
  id: number;
  titel: string;
}

function onderwerpId(waarde: number | KennisbasisOnderwerpRef | null | undefined): number | null {
  if (waarde === null || waarde === undefined) return null;
  return typeof waarde === "object" ? waarde.id : waarde;
}

function onderwerpTitel(waarde: number | KennisbasisOnderwerpRef | null | undefined): string {
  if (waarde === null || waarde === undefined) return "—";
  return typeof waarde === "object" ? waarde.onderwerp : `Onderwerp #${waarde}`;
}

async function postActie<T = { ok: boolean }>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/verbetercentrum/${pad}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Actie mislukt (${res.status}).`);
  return data;
}

const intentieLabels: Record<string, string> = {
  opgelost: "Opgelost",
  onduidelijk: "Verduidelijkingsvraag gesteld",
  "geen-match": "Geen match",
};

const statusLabels: Record<ConversatieDoc["verbeterStatus"], string> = {
  nieuw: "Nieuw",
  beoordeeld: "Beoordeeld",
  opgelost: "Opgelost",
  genegeerd: "Genegeerd",
};

function Badge({ children, kleur }: { children: React.ReactNode; kleur: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.5rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: kleur,
        color: "var(--theme-elevation-900)",
      }}
    >
      {children}
    </span>
  );
}

function Percentagebalk({ label, percentage }: { label: string; percentage: number }) {
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.15rem" }}>
        <span>{label}</span>
        <strong>{percentage}%</strong>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--theme-elevation-100)" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, percentage))}%`,
            borderRadius: 3,
            background: "var(--theme-success-500)",
          }}
        />
      </div>
    </div>
  );
}

function Dashboard({ stats }: { stats: VerbetercentrumStats | null }) {
  if (!stats) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "0.75rem",
        marginBottom: "1.5rem",
        padding: "1rem",
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: "6px",
        background: "var(--theme-elevation-50)",
      }}
    >
      <div>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.vandaag}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--theme-elevation-500)" }}>Vragen vandaag</div>
      </div>
      <div>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.dezeWeek}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--theme-elevation-500)" }}>Deze week</div>
      </div>
      <div>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.gemiddeldeConfidence}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--theme-elevation-500)" }}>Gem. confidence</div>
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <Percentagebalk label="Direct opgelost" percentage={stats.percentageDirectOpgelost} />
        <Percentagebalk label="Verduidelijkingsvragen" percentage={stats.percentageVerduidelijkingsvragen} />
        <Percentagebalk label="Geen match" percentage={stats.percentageGeenMatch} />
      </div>
      <div style={{ gridColumn: "span 2" }}>
        <Percentagebalk label="Negatieve feedback" percentage={stats.percentageNegatieveFeedback} />
        <Percentagebalk label="Contactformulier gebruikt" percentage={stats.percentageContactformulierGebruikt} />
        <Percentagebalk label="Tegenstrijdigheden gedetecteerd" percentage={stats.percentageTegenstrijdigheden} />
      </div>
    </div>
  );
}

function StatistiekLijst({ titel, items }: { titel: string; items: { label: string; aantal: number }[] }) {
  return (
    <div style={{ flex: "1 1 220px", minWidth: 220 }}>
      <h3 style={{ fontSize: "0.9rem", marginBottom: "0.4rem" }}>{titel}</h3>
      {items.length === 0 ? (
        <p style={{ fontSize: "0.8rem", color: "var(--theme-elevation-500)" }}>Nog geen data.</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
          {items.map((item) => (
            <li key={item.label}>
              {item.label} <span style={{ color: "var(--theme-elevation-500)" }}>({item.aantal}×)</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BeslisprocesBlok({ rij }: { rij: ConversatieDoc }) {
  const overwogenBronnen = rij.sources ?? [];
  const kandidaten = (rij.kennisbasisKandidaten ?? []).map((k) => onderwerpTitel(k));

  return (
    <div
      style={{
        padding: "1rem",
        background: "var(--theme-elevation-50)",
        borderRadius: "6px",
        marginTop: "0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        fontSize: "0.85rem",
      }}
    >
      <div>
        <strong>Gebruikersvraag</strong>
        <p style={{ margin: "0.2rem 0" }}>{rij.question}</p>
      </div>
      {rij.previousQuestion && (
        <div>
          <strong>Vervolgvraag op</strong>
          <p style={{ margin: "0.2rem 0" }}>{rij.previousQuestion}</p>
        </div>
      )}
      <div>
        <strong>Intentiebepaling</strong>
        <p style={{ margin: "0.2rem 0" }}>
          {intentieLabels[rij.intentieType ?? ""] ?? "Onbekend"}
          {kandidaten.length > 0 && ` — overwogen: ${kandidaten.join(", ")}`}
        </p>
      </div>
      {rij.gebruikteOfficieleTerm && (
        <div>
          <strong>Officiële term</strong>
          <p style={{ margin: "0.2rem 0" }}>{rij.gebruikteOfficieleTerm}</p>
        </div>
      )}
      {rij.gebruikteSynoniem && (
        <div>
          <strong>Gebruikte synoniem</strong>
          <p style={{ margin: "0.2rem 0" }}>{rij.gebruikteSynoniem}</p>
        </div>
      )}
      <div>
        <strong>Retrieval — overwogen bronnen</strong>
        {overwogenBronnen.length === 0 ? (
          <p style={{ margin: "0.2rem 0", color: "var(--theme-elevation-500)" }}>Geen bronnen gevonden.</p>
        ) : (
          <ul style={{ margin: "0.2rem 0", paddingLeft: "1.1rem" }}>
            {overwogenBronnen.map((bron, i) => (
              <li key={`${bron.refCollection}-${bron.refId}-${i}`}>
                {bron.title}
                {bron.chapterTitle ? ` — ${bron.chapterTitle}` : ""} ({Math.round(bron.similarity * 100)}%)
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Kennisbasis MijnLeerlijn — Fase 4: kennisbasisgebruik en geraadpleegde
          handleidingen bewust als één gekoppeld blok (niet los van elkaar),
          zodat direct zichtbaar is of een antwoord uit de centrale
          kennisbasis, uit handleidingen, of uit beide voortkomt. */}
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <strong>Centrale kennisbasis</strong>
          <p style={{ margin: "0.2rem 0" }}>
            {rij.centraleKennisbasisGebruikt
              ? `✅ Gebruikt (versie ${rij.centraleKennisbasisVersion ?? "onbekend"})`
              : "— Niet gebruikt (nog niet gepubliceerd op het moment van de vraag)"}
          </p>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <strong>Geraadpleegde handleidingen</strong>
          {(rij.steps ?? []).length === 0 ? (
            <p style={{ margin: "0.2rem 0", color: "var(--theme-elevation-500)" }}>Geen structured stappen getoond.</p>
          ) : (
            <ul style={{ margin: "0.2rem 0", paddingLeft: "1.1rem" }}>
              {(rij.steps ?? []).map((stap) => (
                <li key={`${stap.handleidingId}-${stap.stepId}`}>
                  Handleiding #{stap.handleidingId} — stap {stap.stepNummer}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {rij.tegenstrijdigheid && (
        <div
          style={{
            padding: "0.6rem 0.8rem",
            background: "var(--theme-warning-100, #fdf3d7)",
            border: "1px solid var(--theme-warning-500, #e0b400)",
            borderRadius: "4px",
          }}
        >
          <strong>⚠️ Tegenstrijdigheid gedetecteerd</strong>
          <p style={{ margin: "0.2rem 0" }}>{rij.tegenstrijdigheid}</p>
        </div>
      )}
      <div>
        <strong>Antwoord</strong>
        <p style={{ margin: "0.2rem 0", whiteSpace: "pre-wrap" }}>{rij.answer || "(geen antwoord)"}</p>
        {rij.reasoning && (
          <p style={{ margin: "0.2rem 0", color: "var(--theme-elevation-500)" }}>Redenering: {rij.reasoning}</p>
        )}
      </div>
    </div>
  );
}

interface NieuwOnderwerpForm {
  onderwerp: string;
  officieleTerm: string;
  doel: string;
  synoniemen: string;
  voorbeeldvragen: string;
  toelichting: string;
  verduidelijkingsvraag: string;
}

function NieuwOnderwerpModal({
  rij,
  handleidingOpties,
  onSluiten,
  onOpgeslagen,
}: {
  rij: ConversatieDoc;
  handleidingOpties: HandleidingOptie[];
  onSluiten: () => void;
  onOpgeslagen: () => void;
}) {
  const suggestiesUitBronnen = useMemo(() => {
    const uitSteps = (rij.steps ?? []).map((s) => `handleidingen:${s.handleidingId}`);
    const uitSources = (rij.sources ?? [])
      .filter((b) => b.refCollection === "handleidingen" || b.refCollection === "knowledge-sources")
      .map((b) => `${b.refCollection}:${b.refId}`);
    return new Set([...uitSteps, ...uitSources]);
  }, [rij]);

  const [form, setForm] = useState<NieuwOnderwerpForm>({
    onderwerp: rij.question.slice(0, 120),
    officieleTerm: rij.gebruikteOfficieleTerm ?? "",
    doel: "",
    synoniemen: rij.question,
    voorbeeldvragen: [rij.previousQuestion, rij.question].filter(Boolean).join("\n"),
    toelichting: "",
    verduidelijkingsvraag: "",
  });
  const [gekoppeld, setGekoppeld] = useState<Set<string>>(suggestiesUitBronnen);
  const [opslaan, setOpslaan] = useState(false);

  function toggleHandleiding(sleutel: string) {
    setGekoppeld((huidig) => {
      const nieuw = new Set(huidig);
      if (nieuw.has(sleutel)) nieuw.delete(sleutel);
      else nieuw.add(sleutel);
      return nieuw;
    });
  }

  async function opslaan_() {
    if (!form.onderwerp.trim() || !form.officieleTerm.trim()) {
      toast.error("Onderwerp en officiële term zijn verplicht.");
      return;
    }
    setOpslaan(true);
    try {
      await postActie<{ ok: boolean; onderwerpId: number }>("create-onderwerp", {
        conversationId: rij.id,
        onderwerp: {
          onderwerp: form.onderwerp.trim(),
          officieleTerm: form.officieleTerm.trim(),
          doel: form.doel.trim() || undefined,
          synoniemen: form.synoniemen
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          voorbeeldvragen: form.voorbeeldvragen
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          toelichting: form.toelichting.trim() || undefined,
          verduidelijkingsvraag: form.verduidelijkingsvraag.trim() || undefined,
          gekoppeldeHandleidingen: [...gekoppeld].map((sleutel) => {
            const [relationTo, id] = sleutel.split(":");
            return { relationTo, value: Number(id) };
          }),
        },
      });
      toast.success("Nieuw kennisbasis-onderwerp aangemaakt als concept.");
      onOpgeslagen();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aanmaken mislukt.");
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nieuw kennisbasis-onderwerp maken"
      onClick={onSluiten}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--theme-input-bg)",
          borderRadius: "8px",
          padding: "1.5rem",
          maxWidth: 640,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Nieuw kennisbasis-onderwerp</h2>
        <p style={{ color: "var(--theme-elevation-500)", fontSize: "0.85rem" }}>
          Voorgevuld vanuit dit gesprek — controleer en pas aan waar nodig. Wordt opgeslagen als{" "}
          <strong>concept</strong> (nog niet gepubliceerd), niets wordt bewaard vóór &ldquo;Opslaan&rdquo;.
        </p>

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>Onderwerp</label>
        <TextInput
          path="onderwerp"
          value={form.onderwerp}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, onderwerp: e.target.value }))}
        />

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Officiële MijnLeerlijn-term
        </label>
        <TextInput
          path="officieleTerm"
          value={form.officieleTerm}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, officieleTerm: e.target.value }))}
        />

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Wat wil de gebruiker bereiken?
        </label>
        <TextInput
          path="doel"
          value={form.doel}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, doel: e.target.value }))}
        />

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Synoniemen (één per regel of komma-gescheiden)
        </label>
        <textarea
          value={form.synoniemen}
          onChange={(e) => setForm((f) => ({ ...f, synoniemen: e.target.value }))}
          rows={2}
          style={{ width: "100%", padding: "0.4rem", border: "1px solid var(--theme-elevation-150)", borderRadius: 4, background: "var(--theme-input-bg)", color: "inherit" }}
        />

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Voorbeeldvragen (één per regel)
        </label>
        <textarea
          value={form.voorbeeldvragen}
          onChange={(e) => setForm((f) => ({ ...f, voorbeeldvragen: e.target.value }))}
          rows={3}
          style={{ width: "100%", padding: "0.4rem", border: "1px solid var(--theme-elevation-150)", borderRadius: 4, background: "var(--theme-input-bg)", color: "inherit" }}
        />

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Toelichting voor intentiebepaling
        </label>
        <textarea
          value={form.toelichting}
          onChange={(e) => setForm((f) => ({ ...f, toelichting: e.target.value }))}
          rows={2}
          style={{ width: "100%", padding: "0.4rem", border: "1px solid var(--theme-elevation-150)", borderRadius: 4, background: "var(--theme-input-bg)", color: "inherit" }}
        />

        <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Verduidelijkingsvraag (optioneel)
        </label>
        <TextInput
          path="verduidelijkingsvraag"
          value={form.verduidelijkingsvraag}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setForm((f) => ({ ...f, verduidelijkingsvraag: e.target.value }))
          }
        />

        {handleidingOpties.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Gekoppelde handleidingen</span>
            <div style={{ maxHeight: 140, overflowY: "auto", marginTop: "0.3rem" }}>
              {handleidingOpties.map((optie) => {
                const sleutel = `${optie.relationTo}:${optie.id}`;
                return (
                  <label key={sleutel} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <CheckboxInput id={`handleiding-${sleutel}`} checked={gekoppeld.has(sleutel)} onToggle={() => toggleHandleiding(sleutel)} />
                    {optie.relationTo === "handleidingen" ? "Handleiding" : "PDF"}: {optie.titel}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", justifyContent: "flex-end" }}>
          <Button buttonStyle="secondary" onClick={onSluiten} disabled={opslaan}>
            Annuleren
          </Button>
          <Button buttonStyle="primary" onClick={opslaan_} disabled={opslaan}>
            {opslaan ? "Bezig…" : "Opslaan als concept"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function VerbetercentrumView() {
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [rijen, setRijen] = useState<ConversatieDoc[]>([]);
  const [totaalPaginas, setTotaalPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [filters, setFilters] = useState<VerbetercentrumFilterState>(STANDAARD_FILTERS);
  const [stats, setStats] = useState<VerbetercentrumStats | null>(null);
  const [onderwerpen, setOnderwerpen] = useState<OnderwerpOptie[]>([]);
  const [handleidingOpties, setHandleidingOpties] = useState<HandleidingOptie[]>([]);
  const [uitgeklapt, setUitgeklapt] = useState<Set<number>>(new Set());
  const [gekozenOnderwerpPerRij, setGekozenOnderwerpPerRij] = useState<Record<number, string>>({});
  const [gekozenHandleidingPerRij, setGekozenHandleidingPerRij] = useState<Record<number, string>>({});
  const [modalRij, setModalRij] = useState<ConversatieDoc | null>(null);

  async function laadConversaties() {
    setStatus("laden");
    setFoutmelding(null);
    try {
      const params = new URLSearchParams();
      params.set("where[source][equals]", "helpdesk");
      for (const [sleutel, waarde] of buildFilterWhereParams(filters)) params.set(sleutel, waarde);
      params.set("sort", "-createdAt");
      params.set("depth", "1");
      params.set("limit", String(PAGINA_GROOTTE));
      params.set("page", String(pagina));

      const res = await fetch(`/api/assistant-conversations?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Ophalen mislukt (${res.status}).`);
      const data = (await res.json()) as { docs: ConversatieDoc[]; totalPages: number };
      setRijen(data.docs);
      setTotaalPaginas(Math.max(1, data.totalPages));
      setStatus("klaar");
    } catch (error) {
      setFoutmelding(error instanceof Error ? error.message : "Onbekende fout.");
      setStatus("fout");
    }
  }

  async function laadStats() {
    try {
      const res = await fetch("/api/verbetercentrum/stats", { credentials: "include" });
      if (!res.ok) return;
      setStats((await res.json()) as VerbetercentrumStats);
    } catch {
      // Dashboard is een aanvulling, geen kernfunctie — stil falen is hier
      // acceptabel, de vragenlijst zelf blijft gewoon werken.
    }
  }

  async function laadOnderwerpenEnHandleidingen() {
    try {
      const [onderwerpenRes, handleidingenRes, bronnenRes] = await Promise.all([
        fetch("/api/kennisbasis-onderwerpen?limit=200&depth=0&sort=onderwerp", { credentials: "include" }),
        fetch("/api/handleidingen?limit=500&depth=0&sort=titel", { credentials: "include" }),
        fetch("/api/knowledge-sources?limit=500&depth=0&sort=title", { credentials: "include" }),
      ]);
      const onderwerpenData = (await onderwerpenRes.json()) as { docs: OnderwerpOptie[] };
      const handleidingenData = (await handleidingenRes.json()) as { docs: { id: number; titel: string }[] };
      const bronnenData = (await bronnenRes.json()) as { docs: { id: number; title: string }[] };
      setOnderwerpen(onderwerpenData.docs ?? []);
      setHandleidingOpties([
        ...(handleidingenData.docs ?? []).map((h) => ({ relationTo: "handleidingen" as const, id: h.id, titel: h.titel })),
        ...(bronnenData.docs ?? []).map((b) => ({ relationTo: "knowledge-sources" as const, id: b.id, titel: b.title })),
      ]);
    } catch {
      // Dropdowns blijven dan leeg — koppel-acties zijn zo simpelweg niet
      // bruikbaar, maar de rest van het scherm functioneert nog.
    }
  }

  useEffect(() => {
    laadConversaties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagina]);

  useEffect(() => {
    laadStats();
    laadOnderwerpenEnHandleidingen();
  }, []);

  function ververs() {
    laadConversaties();
    laadStats();
  }

  function toggleUitklap(id: number) {
    setUitgeklapt((huidig) => {
      const nieuw = new Set(huidig);
      if (nieuw.has(id)) nieuw.delete(id);
      else nieuw.add(id);
      return nieuw;
    });
  }

  async function koppelOnderwerp(rij: ConversatieDoc) {
    const gekozen = gekozenOnderwerpPerRij[rij.id];
    if (!gekozen) {
      toast.error("Kies eerst een onderwerp.");
      return;
    }
    try {
      await postActie("link-onderwerp", { conversationId: rij.id, onderwerpId: Number(gekozen) });
      toast.success("Onderwerp gekoppeld.");
      ververs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Koppelen mislukt.");
    }
  }

  async function voegToe(rij: ConversatieDoc, field: "synoniemen" | "voorbeeldvragen") {
    const onderwerp = onderwerpId(rij.kennisbasisOnderwerp);
    if (!onderwerp) return;
    try {
      const resultaat = await postActie<{ ok: boolean; toegevoegd: boolean }>("append-to-onderwerp", {
        conversationId: rij.id,
        onderwerpId: onderwerp,
        field,
        text: rij.question,
      });
      toast.success(resultaat.toegevoegd ? "Toegevoegd." : "Stond al in de lijst.");
      ververs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Toevoegen mislukt.");
    }
  }

  async function koppelHandleiding(rij: ConversatieDoc) {
    const onderwerp = onderwerpId(rij.kennisbasisOnderwerp);
    const gekozen = gekozenHandleidingPerRij[rij.id];
    if (!onderwerp || !gekozen) {
      toast.error("Kies eerst een handleiding.");
      return;
    }
    const [relationTo, id] = gekozen.split(":");
    try {
      const resultaat = await postActie<{ ok: boolean; toegevoegd: boolean }>("link-manual", {
        conversationId: rij.id,
        onderwerpId: onderwerp,
        handleiding: { relationTo, value: Number(id) },
      });
      toast.success(resultaat.toegevoegd ? "Handleiding gekoppeld." : "Was al gekoppeld.");
      ververs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Koppelen mislukt.");
    }
  }

  async function zetStatus(rij: ConversatieDoc, status: "opgelost" | "genegeerd") {
    try {
      await postActie("set-status", { conversationId: rij.id, status });
      toast.success(status === "opgelost" ? "Gemarkeerd als opgelost." : "Genegeerd.");
      ververs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status wijzigen mislukt.");
    }
  }

  const onderwerpOpties = useMemo(
    () => onderwerpen.map((o) => ({ label: o.onderwerp, value: String(o.id) })),
    [onderwerpen]
  );
  const handleidingSelectOpties = useMemo(
    () =>
      handleidingOpties.map((h) => ({
        label: `${h.relationTo === "handleidingen" ? "Handleiding" : "PDF"}: ${h.titel}`,
        value: `${h.relationTo}:${h.id}`,
      })),
    [handleidingOpties]
  );

  return (
    <Gutter>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>AI Verbetercentrum</h1>
        <p style={{ color: "var(--theme-elevation-500)", margin: 0 }}>
          Elke helpdeskvraag als leerdata — begrijp waarom de AI tot een antwoord kwam en zet dat direct om in een
          betere Kennisbasis MijnLeerlijn.
        </p>
      </div>

      <Dashboard stats={stats} />

      {stats && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", marginBottom: "1.5rem" }}>
          <StatistiekLijst titel="Meest gestelde vragen" items={stats.meestGesteldeVragen} />
          <StatistiekLijst titel="Meest gebruikte onderwerpen" items={stats.meestGebruikteOnderwerpen} />
          <StatistiekLijst titel="Meest gebruikte handleidingen" items={stats.meestGebruikteHandleidingen} />
          <StatistiekLijst titel="Meest gebruikte synoniemen" items={stats.meestGebruikteSynoniemen} />
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          padding: "0.75rem 1rem",
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: "6px",
          marginBottom: "1rem",
        }}
      >
        <SelectInput
          path="intentieFilter"
          name="intentieFilter"
          label="Intentiebepaling"
          options={[
            { label: "Alle", value: "" },
            { label: "Nog geen kennisbasis-item (geen match)", value: "geen-match" },
            { label: "Verduidelijkingsvraag gesteld", value: "onduidelijk" },
          ]}
          value={filters.intentieFilter ?? ""}
          onChange={(optie) => {
            const gekozen = Array.isArray(optie) ? optie[0] : optie;
            const waarde = gekozen && "value" in gekozen ? gekozen.value : "";
            setPagina(1);
            setFilters((f) => ({ ...f, intentieFilter: (waarde || null) as "geen-match" | "onduidelijk" | null }));
          }}
        />
        {(
          [
            ["negatieveFeedback", "Negatieve feedback"],
            ["contactformulierGebruikt", "Contactformulier gebruikt"],
            ["geenHandleidingGevonden", "Geen handleiding gevonden"],
            ["nogNietBeoordeeld", "Nog niet beoordeeld"],
            ["tegenstrijdigheidGedetecteerd", "Tegenstrijdigheid gedetecteerd"],
          ] as const
        ).map(([veld, label]) => (
          <label key={veld} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
            <CheckboxInput
              id={`filter-${veld}`}
              checked={filters[veld]}
              onToggle={() => {
                setPagina(1);
                setFilters((f) => ({ ...f, [veld]: !f[veld] }));
              }}
            />
            {label}
          </label>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
          <CheckboxInput
            id="filter-lageConfidence"
            checked={filters.lageConfidence}
            onToggle={() => {
              setPagina(1);
              setFilters((f) => ({ ...f, lageConfidence: !f.lageConfidence }));
            }}
          />
          Lage confidence (&lt;
          <input
            type="number"
            value={filters.lageConfidenceGrens}
            onChange={(e) => setFilters((f) => ({ ...f, lageConfidenceGrens: Number(e.target.value) || 0 }))}
            style={{ width: 48, marginLeft: 4, marginRight: 2 }}
          />
          )
        </label>
      </div>

      {status === "laden" && <p>Laden…</p>}
      {status === "fout" && (
        <div style={{ color: "var(--theme-error-500)" }}>
          <p>{foutmelding ?? "Ophalen mislukt."}</p>
          <Button buttonStyle="secondary" onClick={laadConversaties}>
            Opnieuw proberen
          </Button>
        </div>
      )}
      {status === "klaar" && rijen.length === 0 && <p>Nog geen vragen gevonden met deze filters.</p>}

      {status === "klaar" && rijen.length > 0 && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--theme-elevation-150)", textAlign: "left" }}>
                <th style={{ padding: "0.5rem" }}>Datum</th>
                <th style={{ padding: "0.5rem" }}>Vraag</th>
                <th style={{ padding: "0.5rem" }}>Intentie</th>
                <th style={{ padding: "0.5rem" }}>Onderwerp</th>
                <th style={{ padding: "0.5rem" }}>Confidence</th>
                <th style={{ padding: "0.5rem" }}>Feedback</th>
                <th style={{ padding: "0.5rem" }}>Contact</th>
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((rij) => {
                const gekoppeldOnderwerp = onderwerpId(rij.kennisbasisOnderwerp);
                const getoond = !rij.hasAnswer || rij.feedbackRating === "niet_nuttig";
                return (
                  <Fragment key={rij.id}>
                    <tr style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}>
                      <td style={{ padding: "0.5rem", whiteSpace: "nowrap", fontSize: "0.8rem", verticalAlign: "top" }}>
                        {new Date(rij.createdAt).toLocaleString("nl-NL")}
                      </td>
                      <td style={{ padding: "0.5rem", maxWidth: 260, verticalAlign: "top" }}>
                        <button
                          type="button"
                          onClick={() => toggleUitklap(rij.id)}
                          style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}
                        >
                          {uitgeklapt.has(rij.id) ? "▾ " : "▸ "}
                          {rij.question}
                        </button>
                      </td>
                      <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                        <Badge kleur={rij.intentieType === "geen-match" ? "var(--theme-warning-100)" : "var(--theme-elevation-100)"}>
                          {intentieLabels[rij.intentieType ?? ""] ?? "—"}
                        </Badge>
                      </td>
                      <td style={{ padding: "0.5rem", verticalAlign: "top" }}>{onderwerpTitel(rij.kennisbasisOnderwerp)}</td>
                      <td style={{ padding: "0.5rem", verticalAlign: "top" }}>{rij.hasAnswer ? rij.confidence : "—"}</td>
                      <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                        {rij.feedbackRating === "nuttig" ? "👍" : rij.feedbackRating === "niet_nuttig" ? "👎" : "—"}
                      </td>
                      <td style={{ padding: "0.5rem", fontSize: "0.8rem", verticalAlign: "top" }}>
                        {rij.contactFormSubmitted ? "Verstuurd" : getoond ? "Getoond" : "—"}
                      </td>
                      <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                        <Badge kleur="var(--theme-elevation-100)">{statusLabels[rij.verbeterStatus]}</Badge>
                      </td>
                      <td style={{ padding: "0.5rem", minWidth: 260, verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                          <div style={{ display: "flex", gap: "0.3rem" }}>
                            <select
                              value={gekozenOnderwerpPerRij[rij.id] ?? ""}
                              onChange={(e) => setGekozenOnderwerpPerRij((h) => ({ ...h, [rij.id]: e.target.value }))}
                              style={{ flex: 1, fontSize: "0.75rem" }}
                            >
                              <option value="">Kies onderwerp…</option>
                              {onderwerpOpties.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <Button size="small" buttonStyle="secondary" onClick={() => koppelOnderwerp(rij)}>
                              Koppel
                            </Button>
                          </div>
                          <Button size="small" buttonStyle="secondary" onClick={() => setModalRij(rij)}>
                            Nieuw onderwerp maken
                          </Button>
                          <Button
                            size="small"
                            buttonStyle="secondary"
                            disabled={!gekoppeldOnderwerp}
                            onClick={() => voegToe(rij, "synoniemen")}
                          >
                            Voeg toe als synoniem
                          </Button>
                          <Button
                            size="small"
                            buttonStyle="secondary"
                            disabled={!gekoppeldOnderwerp}
                            onClick={() => voegToe(rij, "voorbeeldvragen")}
                          >
                            Voeg toe als voorbeeldvraag
                          </Button>
                          {gekoppeldOnderwerp && (
                            <div style={{ display: "flex", gap: "0.3rem" }}>
                              <select
                                value={gekozenHandleidingPerRij[rij.id] ?? ""}
                                onChange={(e) => setGekozenHandleidingPerRij((h) => ({ ...h, [rij.id]: e.target.value }))}
                                style={{ flex: 1, fontSize: "0.75rem" }}
                              >
                                <option value="">Kies handleiding…</option>
                                {handleidingSelectOpties.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <Button size="small" buttonStyle="secondary" onClick={() => koppelHandleiding(rij)}>
                                Koppel
                              </Button>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "0.3rem" }}>
                            <Button size="small" buttonStyle="primary" onClick={() => zetStatus(rij, "opgelost")}>
                              Markeer opgelost
                            </Button>
                            <Button size="small" buttonStyle="secondary" onClick={() => zetStatus(rij, "genegeerd")}>
                              Negeer
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {uitgeklapt.has(rij.id) && (
                      <tr>
                        <td colSpan={9} style={{ padding: "0 0.5rem 1rem" }}>
                          <BeslisprocesBlok rij={rij} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1rem", alignItems: "center" }}>
            <Button buttonStyle="secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Vorige
            </Button>
            <span style={{ fontSize: "0.85rem" }}>
              Pagina {pagina} van {totaalPaginas}
            </span>
            <Button buttonStyle="secondary" disabled={pagina >= totaalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Volgende
            </Button>
          </div>
        </>
      )}

      {modalRij && (
        <NieuwOnderwerpModal
          rij={modalRij}
          handleidingOpties={handleidingOpties}
          onSluiten={() => setModalRij(null)}
          onOpgeslagen={() => {
            setModalRij(null);
            ververs();
          }}
        />
      )}
    </Gutter>
  );
}
