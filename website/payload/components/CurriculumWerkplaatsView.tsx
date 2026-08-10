"use client";

import { Component, Suspense, useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Gutter, SelectInput, TextInput, toast } from "@payloadcms/ui";

// Beheerpagina Curriculum Werkplaats (Helpdesk-beheerkoppeling 2026, punt
// 5-8): overzicht + detail van alle Curriculum Werkplaats-omgevingen,
// bediend via de proxy-route app/api/curriculum-beheer/[...pad]/route.ts —
// deze component praat NOOIT rechtstreeks met Curriculum Werkplaats, alleen
// met die eigen Helpdesk-route (die op zijn beurt het gedeelde secret
// meestuurt en admin-toegang afdwingt).
//
// Ontwerpkeuze (zie ARCHITECTUUR-HELPDESK-BEHEERKOPPELING.md-onderzoek):
// één statisch geregistreerd pad ("/curriculum-werkplaats", zie
// payload.config.ts) i.p.v. een dynamische routesegment-view — Payload's
// custom-view path-syntax voor dynamische segmenten kon in deze omgeving
// niet geverifieerd worden (geen next dev/build beschikbaar). De
// detailweergave wisselt daarom client-side, via een `?project=<id>`-
// querystring-parameter — nog altijd een bookmarkbare, eigen URL per
// omgeving (/admin/curriculum-werkplaats?project=<uuid>).

const CURRICULUM_PUBLIC_URL = "https://curriculum.mijnleerlijn.chat";

type ProjectStatus = "actief" | "geblokkeerd" | "gearchiveerd";
type StatusFilter = "" | "actief" | "geblokkeerd" | "gearchiveerd" | "wacht_op_ml";

interface ProjectOverzichtRij {
  id: string;
  schoolnaam: string;
  plaats: string | null;
  projectnaam: string;
  schooljaar: string | null;
  projectcode: string | null;
  status: ProjectStatus;
  aangemaaktOp: string;
  laatsteActiviteitOp: string;
  aantalLeraren: number;
  aantalHoofdgebieden: number;
  wachtOpMl: boolean;
}

interface ProjectDetail extends ProjectOverzichtRij {
  hoofdgebiedenDetail: { id: string; naam: string; werkstatus: "bewerkbaar" | "wacht_op_nieuwe_ml_export" }[];
}

interface AuditlogRij {
  id: string;
  projectId: string | null;
  projectnaamSnapshot: string;
  schoolnaamSnapshot: string;
  beheerderNaam: string;
  actie: string;
  tijdstip: string;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  actief: "Actief",
  geblokkeerd: "Geblokkeerd",
  gearchiveerd: "Gearchiveerd",
};

const AUDITLOG_ACTIE_LABEL: Record<string, string> = {
  geblokkeerd: "Geblokkeerd",
  gedeblokkeerd: "Gedeblokkeerd",
  gearchiveerd: "Gearchiveerd",
  heropend: "Heropend",
  wachtwoord_gereset: "Wachtwoord gereset",
  projectcode_gereset: "Projectcode gereset",
  projectlink_geregenereerd: "Projectlink geregenereerd",
  project_verwijderd: "Project verwijderd",
};

const STATUS_FILTER_OPTIES = [
  { label: "Alle statussen", value: "" },
  { label: "Actief", value: "actief" },
  { label: "Geblokkeerd", value: "geblokkeerd" },
  { label: "Gearchiveerd", value: "gearchiveerd" },
  { label: "Wacht op nieuwe export", value: "wacht_op_ml" },
];

function formatDatum(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

async function fetchJson<T>(pad: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  const res = await fetch(`/api/curriculum-beheer/${pad}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, data };
}

async function kopieerNaarKlembord(waarde: string, label: string) {
  try {
    await navigator.clipboard.writeText(waarde);
    toast.success(`${label} gekopieerd.`);
  } catch {
    toast.error(`Kopiëren van ${label.toLowerCase()} mislukt.`);
  }
}

// Nette fout-/lege staat i.p.v. een blanco pagina. Technische details gaan
// uitsluitend naar de serverconsole/browserconsole (voor beheer/logging) —
// nooit als kale foutmelding of stacktrace in de UI zelf. Zie de witte-pagina-
// bugfix: een ontbrekende importMap-registratie liet de hele view eerder
// geruisloos falen, zonder dat onderstaande foutstaten ooit bereikt werden.
function FoutMelding({ herprobeer }: { herprobeer?: () => void }) {
  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid var(--theme-error-500)",
        borderRadius: "4px",
        marginBottom: "1rem",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        De Curriculum Werkplaats kan op dit moment niet worden geladen.
      </p>
      <p style={{ margin: "0.5rem 0 0", color: "var(--theme-elevation-500)" }}>
        Probeer het opnieuw. Blijft dit gebeuren, neem dan contact op met de beheerder — de
        technische details staan in de serverlogs.
      </p>
      {herprobeer && (
        <div style={{ marginTop: "0.75rem" }}>
          <Button buttonStyle="secondary" size="small" onClick={herprobeer}>
            Opnieuw proberen
          </Button>
        </div>
      )}
    </div>
  );
}

interface ErrorBoundaryState {
  heeftFout: boolean;
}

class CurriculumWerkplaatsErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { heeftFout: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { heeftFout: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Alleen voor beheer/logging (browserconsole) — nooit als stacktrace in de UI.
    console.error("[CurriculumWerkplaatsView] onverwachte renderfout:", error, info);
  }

  render() {
    if (this.state.heeftFout) {
      return (
        <Gutter>
          <FoutMelding herprobeer={() => this.setState({ heeftFout: false })} />
        </Gutter>
      );
    }
    return this.props.children;
  }
}

export function CurriculumWerkplaatsView() {
  return (
    <CurriculumWerkplaatsErrorBoundary>
      <Suspense
        fallback={
          <Gutter>
            <p>Laden…</p>
          </Gutter>
        }
      >
        <CurriculumWerkplaatsViewInner />
      </Suspense>
    </CurriculumWerkplaatsErrorBoundary>
  );
}

function CurriculumWerkplaatsViewInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const geselecteerdId = searchParams.get("project");

  const [zoekterm, setZoekterm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [lijst, setLijst] = useState<ProjectOverzichtRij[]>([]);
  const [lijstStatus, setLijstStatus] = useState<"laden" | "klaar" | "fout">("laden");

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [actieBezig, setActieBezig] = useState<string | null>(null);

  const [toonWachtwoord, setToonWachtwoord] = useState<string | null>(null);
  const [toonProjectcode, setToonProjectcode] = useState<string | null>(null);
  const [toonNieuweLink, setToonNieuweLink] = useState<string | null>(null);
  const [eigenWachtwoord, setEigenWachtwoord] = useState("");

  const [toonAuditlog, setToonAuditlog] = useState(false);
  const [auditlog, setAuditlog] = useState<AuditlogRij[]>([]);
  const [auditlogStatus, setAuditlogStatus] = useState<"laden" | "klaar" | "fout">("laden");

  const laadLijst = useCallback(async () => {
    setLijstStatus("laden");
    const params = new URLSearchParams();
    if (zoekterm.trim()) params.set("zoek", zoekterm.trim());
    if (statusFilter) params.set("status", statusFilter);
    const { ok, data } = await fetchJson<{ status: string; projecten?: ProjectOverzichtRij[] }>(
      `projecten?${params.toString()}`
    );
    if (!ok || !data || data.status !== "OK" || !data.projecten) {
      setLijstStatus("fout");
      return;
    }
    setLijst(data.projecten);
    setLijstStatus("klaar");
  }, [zoekterm, statusFilter]);

  // Eenmalige/afhankelijkheid-getriggerde data-load, zelfde gevestigde
  // patroon als DownloadbeheerView.tsx/VariantenView.tsx/VerbetercentrumView.tsx.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadLijst();
  }, [laadLijst]);

  const laadDetail = useCallback(async (id: string) => {
    setDetailStatus("laden");
    const { ok, data } = await fetchJson<{ status: string; project?: ProjectDetail }>(`projecten/${id}`);
    if (!ok || !data || data.status !== "OK" || !data.project) {
      setDetailStatus("fout");
      setDetail(null);
      return;
    }
    setDetail(data.project);
    setDetailStatus("klaar");
  }, []);

  useEffect(() => {
    if (geselecteerdId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      laadDetail(geselecteerdId);
    } else {
      setDetail(null);
      setToonWachtwoord(null);
      setToonProjectcode(null);
      setToonNieuweLink(null);
    }
  }, [geselecteerdId, laadDetail]);

  const laadAuditlog = useCallback(async () => {
    setAuditlogStatus("laden");
    const { ok, data } = await fetchJson<{ status: string; entries?: AuditlogRij[] }>("auditlog?limiet=100");
    if (!ok || !data || data.status !== "OK" || !data.entries) {
      setAuditlogStatus("fout");
      return;
    }
    setAuditlog(data.entries);
    setAuditlogStatus("klaar");
  }, []);

  // Laadt pas bij het inklappen van de auditlog-sectie, zelfde patroon als hierboven.
  useEffect(() => {
    if (toonAuditlog) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      laadAuditlog();
    }
  }, [toonAuditlog, laadAuditlog]);

  function kiesProject(id: string | null) {
    router.push(id ? `${pathname}?project=${id}` : pathname);
  }

  async function voerActieUit(actiePad: string, succesBericht: string) {
    if (!detail) return;
    setActieBezig(actiePad);
    try {
      const { ok, data } = await fetchJson<{ status: string; melding?: string }>(
        `projecten/${detail.id}/${actiePad}`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (!ok || !data || data.status !== "OK") {
        toast.error(data?.melding || "Actie mislukt.");
        return;
      }
      toast.success(succesBericht);
      await Promise.all([laadDetail(detail.id), laadLijst()]);
    } finally {
      setActieBezig(null);
    }
  }

  async function resetWachtwoordActie(nieuwWachtwoord?: string) {
    if (!detail) return;
    setActieBezig("wachtwoord-resetten");
    try {
      const { ok, data } = await fetchJson<{ status: string; nieuwWachtwoord?: string; melding?: string }>(
        `projecten/${detail.id}/wachtwoord-resetten`,
        { method: "POST", body: JSON.stringify(nieuwWachtwoord ? { nieuwWachtwoord } : {}) }
      );
      if (!ok || !data || data.status !== "OK" || !data.nieuwWachtwoord) {
        toast.error(data?.melding || "Wachtwoord resetten mislukt.");
        return;
      }
      setToonWachtwoord(data.nieuwWachtwoord);
      setEigenWachtwoord("");
      toast.success("Wachtwoord gereset.");
    } finally {
      setActieBezig(null);
    }
  }

  async function resetProjectcodeActie() {
    if (!detail) return;
    setActieBezig("projectcode-resetten");
    try {
      const { ok, data } = await fetchJson<{ status: string; projectcode?: string; melding?: string }>(
        `projecten/${detail.id}/projectcode-resetten`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (!ok || !data || data.status !== "OK" || !data.projectcode) {
        toast.error(data?.melding || "Projectcode resetten mislukt.");
        return;
      }
      setToonProjectcode(data.projectcode);
      toast.success("Projectcode gereset.");
      await Promise.all([laadDetail(detail.id), laadLijst()]);
    } finally {
      setActieBezig(null);
    }
  }

  async function regenereerLinkActie() {
    if (!detail) return;
    const bevestigd = window.confirm(
      "Nieuwe projectlink genereren maakt de huidige link ongeldig — iedereen met de oude link moet de nieuwe krijgen. Doorgaan?"
    );
    if (!bevestigd) return;
    setActieBezig("projectlink-regenereren");
    try {
      const { ok, data } = await fetchJson<{ status: string; nieuweProjectId?: string; melding?: string }>(
        `projecten/${detail.id}/projectlink-regenereren`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (!ok || !data || data.status !== "OK" || !data.nieuweProjectId) {
        toast.error(data?.melding || "Nieuwe link genereren mislukt.");
        return;
      }
      setToonNieuweLink(`${CURRICULUM_PUBLIC_URL}/p/${data.nieuweProjectId}`);
      toast.success("Nieuwe projectlink gegenereerd — de oude link werkt niet meer.");
      await laadLijst();
      kiesProject(data.nieuweProjectId);
    } finally {
      setActieBezig(null);
    }
  }

  async function verwijderProjectActie() {
    if (!detail) return;
    const bevestigd = window.confirm(
      `Weet je zeker dat je "${detail.schoolnaam}" (${detail.projectnaam}) definitief wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`
    );
    if (!bevestigd) return;
    setActieBezig("verwijderen");
    try {
      const { ok, data } = await fetchJson<{ status: string; melding?: string }>(`projecten/${detail.id}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      if (!ok || !data || data.status !== "OK") {
        toast.error(data?.melding || "Verwijderen mislukt.");
        return;
      }
      toast.success("Omgeving definitief verwijderd.");
      kiesProject(null);
      await laadLijst();
    } finally {
      setActieBezig(null);
    }
  }

  return (
    <Gutter>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Curriculum Werkplaats</h1>
        <p style={{ color: "var(--theme-elevation-500)", margin: 0 }}>
          Beheer van alle schoolomgevingen in Curriculum Werkplaats — deze pagina praat met Curriculum
          Werkplaats via de beheer-API (zie ARCHITECTUUR-HELPDESK-BEHEERKOPPELING.md).
        </p>
      </div>

      {!detail && geselecteerdId && detailStatus === "laden" && <p>Omgeving laden…</p>}
      {!detail && geselecteerdId && detailStatus === "fout" && (
        <div style={{ marginBottom: "1rem" }}>
          <FoutMelding herprobeer={() => laadDetail(geselecteerdId)} />
          <Button buttonStyle="secondary" onClick={() => kiesProject(null)}>
            ← Terug naar overzicht
          </Button>
        </div>
      )}

      {detail ? (
        <ProjectDetailPaneel
          detail={detail}
          actieBezig={actieBezig}
          toonWachtwoord={toonWachtwoord}
          toonProjectcode={toonProjectcode}
          toonNieuweLink={toonNieuweLink}
          eigenWachtwoord={eigenWachtwoord}
          setEigenWachtwoord={setEigenWachtwoord}
          onTerug={() => kiesProject(null)}
          onBlokkeren={() => voerActieUit("blokkeren", "Omgeving geblokkeerd.")}
          onHeropenen={() =>
            voerActieUit("heropenen", detail.status === "gearchiveerd" ? "Omgeving heropend." : "Omgeving gedeblokkeerd.")
          }
          onArchiveren={() => voerActieUit("archiveren", "Omgeving gearchiveerd.")}
          onResetWachtwoord={resetWachtwoordActie}
          onResetProjectcode={resetProjectcodeActie}
          onRegenereerLink={regenereerLinkActie}
          onVerwijderen={verwijderProjectActie}
          onSluitWachtwoord={() => setToonWachtwoord(null)}
          onSluitProjectcode={() => setToonProjectcode(null)}
          onSluitNieuweLink={() => setToonNieuweLink(null)}
        />
      ) : (
        !geselecteerdId && (
          <>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-end",
                marginBottom: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 240 }}>
                <TextInput
                  path="zoekterm"
                  label="Zoeken"
                  value={zoekterm}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setZoekterm(e.target.value)}
                  placeholder="Schoolnaam, plaats, projectnaam of projectcode"
                />
              </div>
              <div style={{ minWidth: 220 }}>
                <SelectInput
                  path="statusFilter"
                  name="statusFilter"
                  label="Status"
                  options={STATUS_FILTER_OPTIES}
                  value={statusFilter}
                  onChange={(optie) => {
                    const gekozen = Array.isArray(optie) ? optie[0] : optie;
                    const waarde = gekozen && "value" in gekozen ? gekozen.value : "";
                    setStatusFilter((waarde || "") as StatusFilter);
                  }}
                />
              </div>
            </div>

            {lijstStatus === "laden" && <p>Laden…</p>}
            {lijstStatus === "fout" && <FoutMelding herprobeer={laadLijst} />}

            {lijstStatus === "klaar" && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--theme-elevation-150)", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem" }}>School</th>
                    <th style={{ padding: "0.5rem" }}>Plaats</th>
                    <th style={{ padding: "0.5rem" }}>Project</th>
                    <th style={{ padding: "0.5rem" }}>Schooljaar</th>
                    <th style={{ padding: "0.5rem" }}>Projectcode</th>
                    <th style={{ padding: "0.5rem" }}>Aangemaakt</th>
                    <th style={{ padding: "0.5rem" }}>Laatste activiteit</th>
                    <th style={{ padding: "0.5rem" }}>Status</th>
                    <th style={{ padding: "0.5rem", textAlign: "center" }}>Leraren</th>
                    <th style={{ padding: "0.5rem", textAlign: "center" }}>Hoofdgebieden</th>
                  </tr>
                </thead>
                <tbody>
                  {lijst.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: "1rem", color: "var(--theme-elevation-500)" }}>
                        Geen omgevingen gevonden.
                      </td>
                    </tr>
                  )}
                  {lijst.map((rij) => (
                    <tr
                      key={rij.id}
                      onClick={() => kiesProject(rij.id)}
                      style={{ borderBottom: "1px solid var(--theme-elevation-100)", cursor: "pointer" }}
                    >
                      <td style={{ padding: "0.5rem" }}>{rij.schoolnaam}</td>
                      <td style={{ padding: "0.5rem" }}>{rij.plaats ?? "—"}</td>
                      <td style={{ padding: "0.5rem" }}>{rij.projectnaam}</td>
                      <td style={{ padding: "0.5rem" }}>{rij.schooljaar ?? "—"}</td>
                      <td style={{ padding: "0.5rem" }}>{rij.projectcode ?? "—"}</td>
                      <td style={{ padding: "0.5rem" }}>{formatDatum(rij.aangemaaktOp)}</td>
                      <td style={{ padding: "0.5rem" }}>{formatDatum(rij.laatsteActiviteitOp)}</td>
                      <td style={{ padding: "0.5rem" }}>
                        {STATUS_LABEL[rij.status]}
                        {rij.wachtOpMl ? " · wacht op nieuwe export" : ""}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>{rij.aantalLeraren}</td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>{rij.aantalHoofdgebieden}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ borderTop: "1px solid var(--theme-elevation-150)", paddingTop: "1rem" }}>
              <Button buttonStyle="secondary" onClick={() => setToonAuditlog((v) => !v)}>
                {toonAuditlog ? "Verberg auditlog" : "Toon auditlog"}
              </Button>
              {toonAuditlog && (
                <div style={{ marginTop: "1rem" }}>
                  {auditlogStatus === "laden" && <p>Laden…</p>}
                  {auditlogStatus === "fout" && <FoutMelding herprobeer={laadAuditlog} />}
                  {auditlogStatus === "klaar" && (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--theme-elevation-150)", textAlign: "left" }}>
                          <th style={{ padding: "0.5rem" }}>Tijdstip</th>
                          <th style={{ padding: "0.5rem" }}>School / project</th>
                          <th style={{ padding: "0.5rem" }}>Actie</th>
                          <th style={{ padding: "0.5rem" }}>Beheerder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditlog.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ padding: "1rem", color: "var(--theme-elevation-500)" }}>
                              Nog geen beheeracties gelogd.
                            </td>
                          </tr>
                        )}
                        {auditlog.map((entry) => (
                          <tr key={entry.id} style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}>
                            <td style={{ padding: "0.5rem" }}>{formatDatum(entry.tijdstip)}</td>
                            <td style={{ padding: "0.5rem" }}>
                              {entry.schoolnaamSnapshot} — {entry.projectnaamSnapshot}
                            </td>
                            <td style={{ padding: "0.5rem" }}>{AUDITLOG_ACTIE_LABEL[entry.actie] ?? entry.actie}</td>
                            <td style={{ padding: "0.5rem" }}>{entry.beheerderNaam}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </>
        )
      )}
    </Gutter>
  );
}

function ProjectDetailPaneel(props: {
  detail: ProjectDetail;
  actieBezig: string | null;
  toonWachtwoord: string | null;
  toonProjectcode: string | null;
  toonNieuweLink: string | null;
  eigenWachtwoord: string;
  setEigenWachtwoord: (waarde: string) => void;
  onTerug: () => void;
  onBlokkeren: () => void;
  onHeropenen: () => void;
  onArchiveren: () => void;
  onResetWachtwoord: (eigen?: string) => void;
  onResetProjectcode: () => void;
  onRegenereerLink: () => void;
  onVerwijderen: () => void;
  onSluitWachtwoord: () => void;
  onSluitProjectcode: () => void;
  onSluitNieuweLink: () => void;
}) {
  const { detail } = props;
  const projectlink = `${CURRICULUM_PUBLIC_URL}/p/${detail.id}`;
  const bezig = (actie: string) => props.actieBezig === actie;

  return (
    <div>
      <Button buttonStyle="secondary" onClick={props.onTerug} size="small">
        ← Terug naar overzicht
      </Button>

      <h2 style={{ margin: "1rem 0 0.25rem" }}>{detail.schoolnaam}</h2>
      <p style={{ color: "var(--theme-elevation-500)", marginTop: 0 }}>
        {detail.projectnaam}
        {detail.schooljaar ? ` — schooljaar ${detail.schooljaar}` : ""}
      </p>

      {props.toonWachtwoord && (
        <EenmaligeWaardeBanner
          titel="Nieuw wachtwoord"
          waarschuwing="Kopieer dit nu en deel het veilig met de school — het wordt hierna nergens meer getoond."
          waarde={props.toonWachtwoord}
          onSluiten={props.onSluitWachtwoord}
        />
      )}
      {props.toonProjectcode && (
        <EenmaligeWaardeBanner
          titel="Nieuwe projectcode"
          waarschuwing="De oude projectcode werkt niet meer."
          waarde={props.toonProjectcode}
          onSluiten={props.onSluitProjectcode}
        />
      )}
      {props.toonNieuweLink && (
        <EenmaligeWaardeBanner
          titel="Nieuwe projectlink"
          waarschuwing="De oude link werkt niet meer — deel deze nieuwe link met de school."
          waarde={props.toonNieuweLink}
          onSluiten={props.onSluitNieuweLink}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          margin: "1.5rem 0",
          padding: "1rem",
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: "4px",
          background: "var(--theme-input-bg)",
        }}
      >
        <Veld label="Plaats" waarde={detail.plaats ?? "—"} />
        <Veld label="Status" waarde={STATUS_LABEL[detail.status]} />
        <Veld label="Wacht op nieuwe export" waarde={detail.wachtOpMl ? "Ja" : "Nee"} />
        <Veld label="Projectcode" waarde={detail.projectcode ?? "—"} kopieerbaar />
        <Veld label="Projectlink" waarde={projectlink} kopieerbaar />
        <Veld label="Aangemaakt op" waarde={formatDatum(detail.aangemaaktOp)} />
        <Veld label="Laatste activiteit" waarde={formatDatum(detail.laatsteActiviteitOp)} />
        <Veld label="Aantal leraren" waarde={String(detail.aantalLeraren)} />
        <Veld label="Aantal hoofdgebieden" waarde={String(detail.aantalHoofdgebieden)} />
      </div>

      <h3 style={{ marginBottom: "0.5rem" }}>Hoofdgebieden</h3>
      {detail.hoofdgebiedenDetail.length === 0 ? (
        <p style={{ color: "var(--theme-elevation-500)" }}>Nog geen hoofdgebieden.</p>
      ) : (
        <ul style={{ margin: "0 0 1.5rem", paddingLeft: "1.25rem" }}>
          {detail.hoofdgebiedenDetail.map((h) => (
            <li key={h.id}>
              {h.naam} —{" "}
              {h.werkstatus === "bewerkbaar" ? "bewerkbaar" : "wacht op nieuwe export"}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginBottom: "0.5rem" }}>Acties</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <a href={projectlink} target="_blank" rel="noopener noreferrer">
          <Button buttonStyle="secondary" size="small">
            Open omgeving als beheerder
          </Button>
        </a>
        <Button buttonStyle="secondary" size="small" onClick={() => kopieerNaarKlembord(projectlink, "Projectlink")}>
          Kopieer projectlink
        </Button>
        {detail.projectcode && (
          <Button
            buttonStyle="secondary"
            size="small"
            onClick={() => kopieerNaarKlembord(detail.projectcode as string, "Projectcode")}
          >
            Kopieer projectcode
          </Button>
        )}

        {detail.status !== "geblokkeerd" && (
          <Button buttonStyle="secondary" size="small" disabled={bezig("blokkeren")} onClick={props.onBlokkeren}>
            {bezig("blokkeren") ? "Bezig…" : "Blokkeren"}
          </Button>
        )}
        {detail.status !== "actief" && (
          <Button buttonStyle="secondary" size="small" disabled={bezig("heropenen")} onClick={props.onHeropenen}>
            {bezig("heropenen")
              ? "Bezig…"
              : detail.status === "gearchiveerd"
                ? "Heropenen"
                : "Deblokkeren"}
          </Button>
        )}
        {detail.status !== "gearchiveerd" && (
          <Button buttonStyle="secondary" size="small" disabled={bezig("archiveren")} onClick={props.onArchiveren}>
            {bezig("archiveren") ? "Bezig…" : "Archiveren"}
          </Button>
        )}
        <Button
          buttonStyle="secondary"
          size="small"
          disabled={bezig("projectcode-resetten")}
          onClick={props.onResetProjectcode}
        >
          {bezig("projectcode-resetten") ? "Bezig…" : "Projectcode resetten"}
        </Button>
        <Button
          buttonStyle="secondary"
          size="small"
          disabled={bezig("projectlink-regenereren")}
          onClick={props.onRegenereerLink}
        >
          {bezig("projectlink-regenereren") ? "Bezig…" : "Nieuwe projectlink genereren"}
        </Button>
      </div>

      <div
        style={{
          padding: "1rem",
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: "4px",
          marginBottom: "1.5rem",
        }}
      >
        <h4 style={{ marginTop: 0 }}>Wachtwoord resetten</h4>
        <p style={{ color: "var(--theme-elevation-500)" }}>
          Het bestaande wachtwoord is nergens leesbaar — je kunt het uitsluitend vervangen door een nieuw
          wachtwoord. Laat het veld leeg voor een automatisch gegenereerd wachtwoord.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <TextInput
              path="eigenWachtwoord"
              label="Nieuw wachtwoord (optioneel)"
              value={props.eigenWachtwoord}
              onChange={(e: ChangeEvent<HTMLInputElement>) => props.setEigenWachtwoord(e.target.value)}
              placeholder="Leeg = automatisch genereren"
            />
          </div>
          <Button
            buttonStyle="primary"
            disabled={bezig("wachtwoord-resetten")}
            onClick={() => props.onResetWachtwoord(props.eigenWachtwoord.trim() || undefined)}
          >
            {bezig("wachtwoord-resetten") ? "Bezig…" : "Wachtwoord resetten"}
          </Button>
        </div>
      </div>

      <div
        style={{
          padding: "1rem",
          border: "1px solid var(--theme-error-500)",
          borderRadius: "4px",
        }}
      >
        <h4 style={{ marginTop: 0, color: "var(--theme-error-500)" }}>Gevarenzone</h4>
        <p style={{ color: "var(--theme-elevation-500)" }}>
          Definitief verwijderen kan niet ongedaan worden gemaakt — alle leraren, curriculumdata en
          geschiedenis van deze omgeving gaan verloren.
        </p>
        <Button buttonStyle="secondary" disabled={bezig("verwijderen")} onClick={props.onVerwijderen}>
          {bezig("verwijderen") ? "Bezig…" : "Omgeving definitief verwijderen"}
        </Button>
      </div>
    </div>
  );
}

function Veld({ label, waarde, kopieerbaar }: { label: string; waarde: string; kopieerbaar?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--theme-elevation-500)", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ wordBreak: "break-all" }}>{waarde}</span>
        {kopieerbaar && waarde !== "—" && (
          <button
            type="button"
            onClick={() => kopieerNaarKlembord(waarde, label)}
            style={{
              border: "none",
              background: "none",
              color: "var(--theme-text-500)",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
              fontSize: "0.75rem",
            }}
          >
            kopieer
          </button>
        )}
      </div>
    </div>
  );
}

function EenmaligeWaardeBanner({
  titel,
  waarschuwing,
  waarde,
  onSluiten,
}: {
  titel: string;
  waarschuwing: string;
  waarde: string;
  onSluiten: () => void;
}) {
  return (
    <div
      style={{
        margin: "1rem 0",
        padding: "1rem",
        border: "1px solid var(--theme-warning-500)",
        borderRadius: "4px",
        background: "var(--theme-warning-50)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <strong>{titel}</strong>
          <p style={{ margin: "0.25rem 0" }}>{waarschuwing}</p>
          <code style={{ wordBreak: "break-all" }}>{waarde}</code>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          <Button buttonStyle="secondary" size="small" onClick={() => kopieerNaarKlembord(waarde, titel)}>
            Kopieer
          </Button>
          <Button buttonStyle="secondary" size="small" onClick={onSluiten}>
            Sluiten
          </Button>
        </div>
      </div>
    </div>
  );
}
