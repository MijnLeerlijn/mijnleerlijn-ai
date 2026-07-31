"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Button, CheckboxInput, Gutter, TextInput, toast } from "@payloadcms/ui";
import { defaultVariant } from "@/config/variants";

// Multi-brand variants (2026-07-30): overzichtslijst + snelle acties voor de
// Variants-collectie (payload/collections/Variants.ts) — zelfde architectuur
// als DownloadcategorieenView.tsx/HelpdeskVragenView.tsx: gewone Payload
// REST-calls voor create/update (de collectie staat al open voor adminOnly,
// zelfde bewezen CSRF-vrije patroon als elders), een gecontroleerde route
// alleen voor verwijderen (app/api/variants/[id]/delete) en statistieken
// (app/api/variants/stats) die geen los veld op de collectie zijn. Diepere
// bewerking (logo uploaden, terminologiewoordenboek, accentkleur, tagline,
// website-teksten) loopt door naar Payload's eigen, al volledig werkende
// editscherm (Variants.ts staat niet op admin.hidden — zie het commentaar
// daar voor waarom niet — dus /admin/collections/variants/{id} blijft
// rechtstreeks bereikbaar) — geen dubbele upload-/array-editor bouwen.

interface VariantDoc {
  id: number;
  name: string;
  slug: string;
  status: "concept" | "actief" | "gearchiveerd";
  actief: boolean;
  educationType: string;
  domain: { type: "custom_domain" | "subdomain" | "slug_path"; value: string; domainStatus: string };
  branding: { logo?: { url?: string } | number | null; productName: string };
}

interface Stats {
  aantalKennisbronnen: number;
  laatsteIndexatie: string | null;
  laatsteGesprek: string | null;
}

function variantPublicUrl(variant: VariantDoc): string {
  if (variant.domain.type === "custom_domain") return `https://${variant.domain.value}`;
  const hoofddomein = defaultVariant.domain.value;
  if (variant.domain.type === "subdomain") return `https://${variant.domain.value}.${hoofddomein}`;
  return `https://${hoofddomein}/${variant.domain.value}`;
}

function slugify(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatDatum(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}


export function VariantenView() {
  const [varianten, setVarianten] = useState<VariantDoc[]>([]);
  const [stats, setStats] = useState<Record<number, Stats>>({});
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuweHostname, setNieuweHostname] = useState("");
  const [nieuwOnderwijstype, setNieuwOnderwijstype] = useState("algemeen");
  const [toevoegen, setToevoegen] = useState(false);
  const [gekoppeldeContent, setGekoppeldeContent] = useState<Record<number, Record<string, number>>>({});

  async function laadAlles() {
    setStatus("laden");
    try {
      const [variantenRes, statsRes] = await Promise.all([
        fetch("/api/variants?limit=100&sort=name&depth=1", { credentials: "include" }),
        fetch("/api/variants/stats", { credentials: "include" }),
      ]);
      if (!variantenRes.ok) throw new Error(`Ophalen mislukt (${variantenRes.status}).`);
      const data = (await variantenRes.json()) as { docs: VariantDoc[] };
      setVarianten(data.docs);
      if (statsRes.ok) setStats(await statsRes.json());
      setStatus("klaar");
    } catch {
      setStatus("fout");
    }
  }

  useEffect(() => {
    laadAlles();
  }, []);

  async function wijzigActief(variant: VariantDoc, actief: boolean) {
    setVarianten((huidig) => huidig.map((v) => (v.id === variant.id ? { ...v, actief } : v)));
    try {
      const res = await fetch(`/api/variants/${variant.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actief }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Opslaan van 'Actief' is mislukt.");
      setVarianten((huidig) => huidig.map((v) => (v.id === variant.id ? { ...v, actief: variant.actief } : v)));
    }
  }

  async function voegToe() {
    const naam = nieuweNaam.trim();
    const hostname = nieuweHostname.trim();
    if (!naam || !hostname) return;
    setToevoegen(true);
    try {
      const res = await fetch("/api/variants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: naam,
          slug: `${slugify(naam)}-${Date.now().toString(36)}`,
          educationType: nieuwOnderwijstype.trim() || "algemeen",
          domain: { type: "subdomain", value: slugify(hostname), domainStatus: "subdomain" },
          branding: { productName: naam, tagline: naam },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
        throw new Error(data?.errors?.[0]?.message || "Aanmaken mislukt.");
      }
      setNieuweNaam("");
      setNieuweHostname("");
      setNieuwOnderwijstype("algemeen");
      toast.success(`Variant "${naam}" toegevoegd — vul verder aan (logo, terminologie, …) via 'Volledig bewerken'.`);
      await laadAlles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aanmaken mislukt.");
    } finally {
      setToevoegen(false);
    }
  }

  async function verwijderOfWaarschuw(variant: VariantDoc) {
    if (!window.confirm(`Variant "${variant.name}" verwijderen?`)) return;
    try {
      const res = await fetch(`/api/variants/${variant.id}/delete`, { method: "POST", credentials: "include" });
      const data = (await res.json().catch(() => null)) as { error?: string; gekoppeld?: Record<string, number> } | null;
      if (res.status === 409 && data?.gekoppeld) {
        setGekoppeldeContent((huidig) => ({ ...huidig, [variant.id]: data.gekoppeld! }));
        toast.error(data.error || "Deze variant heeft nog gekoppelde content.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Verwijderen is mislukt.");
      toast.success(`Variant "${variant.name}" verwijderd.`);
      await laadAlles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verwijderen is mislukt.");
    }
  }

  async function archiveer(variant: VariantDoc) {
    try {
      const res = await fetch(`/api/variants/${variant.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "gearchiveerd", actief: false }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Variant "${variant.name}" gearchiveerd.`);
      setGekoppeldeContent((huidig) => {
        const { [variant.id]: _verwijderd, ...rest } = huidig;
        return rest;
      });
      await laadAlles();
    } catch {
      toast.error("Archiveren is mislukt.");
    }
  }

  return (
    <Gutter>
      <h1 style={{ marginBottom: "0.25rem" }}>Varianten</h1>
      <p style={{ color: "var(--theme-elevation-500)", marginTop: 0 }}>
        Multi-brand: elke variant is een complete Helpdesk-omgeving (branding, kennisbasis, terminologie,
        hostname). "Actief" bepaalt of bezoekers de variant kunnen bereiken.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          margin: "1rem 0",
          padding: "1rem",
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: "4px",
        }}
      >
        <div style={{ maxWidth: 240 }}>
          <TextInput
            path="nieuweNaam"
            label="Naam"
            value={nieuweNaam}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNieuweNaam(e.target.value)}
            placeholder="Bv. MijnMonti"
          />
        </div>
        <div style={{ maxWidth: 200 }}>
          <TextInput
            path="nieuweHostname"
            label="Hostname"
            value={nieuweHostname}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNieuweHostname(e.target.value)}
            placeholder="Bv. mijnmonti"
          />
        </div>
        <div style={{ maxWidth: 200 }}>
          <TextInput
            path="nieuwOnderwijstype"
            label="Onderwijstype"
            value={nieuwOnderwijstype}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNieuwOnderwijstype(e.target.value)}
            placeholder="Bv. montessori"
          />
        </div>
        <Button buttonStyle="secondary" disabled={!nieuweNaam.trim() || !nieuweHostname.trim() || toevoegen} onClick={voegToe}>
          {toevoegen ? "Bezig met toevoegen…" : "+ Nieuwe variant"}
        </Button>
      </div>

      {status === "laden" && <p>Laden…</p>}
      {status === "fout" && <p style={{ color: "var(--theme-error-500)" }}>Ophalen mislukt. Herlaad de pagina.</p>}

      {status === "klaar" && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--theme-elevation-150)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Logo</th>
              <th style={{ padding: "0.5rem" }}>Productnaam</th>
              <th style={{ padding: "0.5rem" }}>URL/hostname</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Actief</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Kennisbronnen</th>
              <th style={{ padding: "0.5rem" }}>Laatste indexatie</th>
              <th style={{ padding: "0.5rem" }}>Laatste gesprek</th>
              <th style={{ padding: "0.5rem" }}>Acties</th>
            </tr>
          </thead>
          <tbody>
            {varianten.map((variant) => {
              const logoUrl = typeof variant.branding.logo === "object" ? variant.branding.logo?.url : undefined;
              const variantStats = stats[variant.id];
              const gekoppeld = gekoppeldeContent[variant.id];
              const url = variantPublicUrl(variant);
              return (
                <tr key={variant.id} style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}>
                  <td style={{ padding: "0.5rem" }}>
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="" style={{ height: 24, width: "auto" }} />
                    ) : (
                      <span style={{ color: "var(--theme-elevation-400)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <div>{variant.branding.productName || variant.name}</div>
                    <a
                      href={`/admin/collections/variants/${variant.id}`}
                      style={{ fontSize: 12, color: "var(--theme-elevation-500)" }}
                    >
                      Volledig bewerken
                    </a>
                  </td>
                  <td style={{ padding: "0.5rem", fontSize: 13 }}>{url}</td>
                  <td style={{ padding: "0.5rem", textAlign: "center" }}>
                    <CheckboxInput
                      id={`actief-${variant.id}`}
                      checked={variant.actief}
                      onToggle={(e) => wijzigActief(variant, e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: "0.5rem", textAlign: "center" }}>{variantStats?.aantalKennisbronnen ?? "…"}</td>
                  <td style={{ padding: "0.5rem" }}>{formatDatum(variantStats?.laatsteIndexatie ?? null)}</td>
                  <td style={{ padding: "0.5rem" }}>{formatDatum(variantStats?.laatsteGesprek ?? null)}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-start" }}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Button buttonStyle="secondary" size="small">
                          Open variant
                        </Button>
                      </a>
                      {gekoppeld ? (
                        <Button buttonStyle="secondary" size="small" onClick={() => archiveer(variant)}>
                          Archiveer i.p.v. verwijderen
                        </Button>
                      ) : (
                        <Button buttonStyle="secondary" size="small" onClick={() => verwijderOfWaarschuw(variant)}>
                          Verwijderen
                        </Button>
                      )}
                    </div>
                    {gekoppeld && (
                      <p style={{ fontSize: 11, color: "var(--theme-elevation-500)", marginTop: "0.35rem", maxWidth: 220 }}>
                        Nog gekoppeld: {Object.entries(gekoppeld)
                          .filter(([, n]) => n > 0)
                          .map(([k, n]) => `${k} (${n})`)
                          .join(", ")}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Gutter>
  );
}
