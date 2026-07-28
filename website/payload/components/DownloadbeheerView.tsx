"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, CheckboxInput, Gutter, SelectInput, toast } from "@payloadcms/ui";

// Downloadbeheer (2026-07-27): één centrale tabel voor alle publicatie-
// instellingen van downloadbare items — zowel gestructureerde Handleidingen
// als PDF-bronnen (KnowledgeSources). Vervangt het moeten openen van elk
// document apart om titel/zichtbaarheid/categorie/volgorde te zetten; die
// velden zijn daarom admin.hidden gemaakt op beide onderliggende collecties
// (zie Handleidingen.ts/KnowledgeSources.ts) — de data zelf blijft
// ongewijzigd, alleen de bewerkplek verhuist hierheen. Bewerken van de
// daadwerkelijke bestandsinhoud/stappen blijft in de eigen collectie-editor
// (zie de "Bewerken"-link per rij).
//
// Eén centrale "Opslaan"-knop i.p.v. auto-save per veld: bij tientallen
// rijen voorkomt dit een stortvloed aan losse netwerkverzoeken en losse
// foutafhandeling per cel.

type ItemType = "handleiding" | "pdf";

interface CategorieOptie {
  id: number;
  title: string;
}

interface Rij {
  key: string;
  type: ItemType;
  id: number;
  titel: string;
  categorie: number | null;
  zichtbaar: boolean;
  volgorde: number | null;
  gewijzigd: boolean;
}

interface HandleidingDoc {
  id: number;
  titel: string;
  categorie?: number | { id: number } | null;
  zichtbaarInSidebar?: boolean | null;
  volgorde?: number | null;
}

interface KnowledgeSourceDoc {
  id: number;
  title: string;
  categorie?: number | { id: number } | null;
  zichtbaar?: boolean | null;
  volgorde?: number | null;
}

function categorieId(waarde: number | { id: number } | null | undefined): number | null {
  if (waarde === null || waarde === undefined) return null;
  return typeof waarde === "object" ? waarde.id : waarde;
}

async function haalAlleOp<T>(collectie: string, sort?: string): Promise<T[]> {
  const params = new URLSearchParams({ limit: "1000", depth: "0" });
  if (sort) params.set("sort", sort);
  const res = await fetch(`/api/${collectie}?${params.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Ophalen van ${collectie} mislukt (${res.status}).`);
  const data = (await res.json()) as { docs: T[] };
  return data.docs;
}

export function DownloadbeheerView() {
  const [rijen, setRijen] = useState<Rij[]>([]);
  const [categorieen, setCategorieen] = useState<CategorieOptie[]>([]);
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [opslaan, setOpslaan] = useState(false);

  async function laadAlles() {
    setStatus("laden");
    try {
      const [handleidingen, bronnen, cats] = await Promise.all([
        haalAlleOp<HandleidingDoc>("handleidingen"),
        haalAlleOp<KnowledgeSourceDoc>("knowledge-sources"),
        haalAlleOp<CategorieOptie>("categories", "volgorde"),
      ]);

      const rijenHandleidingen: Rij[] = handleidingen.map((h) => ({
        key: `handleiding-${h.id}`,
        type: "handleiding",
        id: h.id,
        titel: h.titel,
        categorie: categorieId(h.categorie),
        zichtbaar: Boolean(h.zichtbaarInSidebar),
        volgorde: h.volgorde ?? null,
        gewijzigd: false,
      }));
      const rijenBronnen: Rij[] = bronnen.map((b) => ({
        key: `pdf-${b.id}`,
        type: "pdf",
        id: b.id,
        titel: b.title,
        categorie: categorieId(b.categorie),
        zichtbaar: Boolean(b.zichtbaar),
        volgorde: b.volgorde ?? null,
        gewijzigd: false,
      }));

      setRijen(
        [...rijenHandleidingen, ...rijenBronnen].sort((a, b) => a.titel.localeCompare(b.titel, "nl"))
      );
      setCategorieen(cats);
      setStatus("klaar");
    } catch {
      setStatus("fout");
    }
  }

  useEffect(() => {
    laadAlles();
  }, []);

  const categorieOpties = useMemo(
    () => [
      { label: "Geen categorie", value: "" },
      ...categorieen.map((c) => ({ label: c.title, value: String(c.id) })),
    ],
    [categorieen]
  );

  function werkRijBij(key: string, wijziging: Partial<Rij>) {
    setRijen((huidig) => huidig.map((r) => (r.key === key ? { ...r, ...wijziging, gewijzigd: true } : r)));
  }

  const aantalGewijzigd = rijen.filter((r) => r.gewijzigd).length;

  async function slaOp() {
    const teBewaren = rijen.filter((r) => r.gewijzigd);
    if (teBewaren.length === 0) return;
    setOpslaan(true);
    try {
      const resultaten = await Promise.allSettled(
        teBewaren.map(async (r) => {
          if (r.type === "handleiding") {
            const res = await fetch(`/api/handleidingen/${r.id}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                titel: r.titel,
                categorie: r.categorie,
                zichtbaarInSidebar: r.zichtbaar,
                volgorde: r.volgorde,
              }),
            });
            if (!res.ok) throw new Error(String(r.id));
            return;
          }

          // PDF (knowledge-sources): KnowledgeSources.ts staat `update:
          // adminOnly` — een rechtstreekse PATCH hierheen geeft een
          // redacteur (niet-admin) altijd een 403. Titel/zichtbaar/
          // categorie/volgorde lopen daarom allemaal via dezelfde
          // gecontroleerde download-settings-route (overrideAccess: true,
          // uitsluitend deze vier velden — zie die route). De losse,
          // stil-falende directe PATCH voor `volgorde` is vervallen: die
          // vereiste voorheen adminrechten, nu geldt overal dezelfde
          // isEditor-toegang als voor zichtbaar/categorie.
          const res = await fetch("/api/knowledge-sources/download-settings", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: r.id,
              title: r.titel,
              downloadVisible: r.zichtbaar,
              downloadCategory: r.categorie,
              volgorde: r.volgorde,
            }),
          });
          if (!res.ok) throw new Error(String(r.id));
        })
      );

      const mislukt = resultaten.filter((r) => r.status === "rejected").length;
      if (mislukt > 0) {
        toast.error(`${mislukt} van ${teBewaren.length} wijziging(en) konden niet opgeslagen worden.`);
      } else {
        toast.success(`${teBewaren.length} item(en) bijgewerkt.`);
      }
      await laadAlles();
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <Gutter>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Downloadbeheer</h1>
          <p style={{ color: "var(--theme-elevation-500)", margin: 0 }}>
            Titel, zichtbaarheid, categorie en volgorde van alle handleidingen en PDF&apos;s op de publieke
            downloadpagina — de bestandsinhoud/stappen pas je aan via &ldquo;Bewerken&rdquo;.
          </p>
        </div>
        <Button
          buttonStyle="primary"
          disabled={aantalGewijzigd === 0 || opslaan}
          onClick={slaOp}
        >
          {opslaan ? "Bezig met opslaan…" : `Opslaan${aantalGewijzigd > 0 ? ` (${aantalGewijzigd})` : ""}`}
        </Button>
      </div>

      {status === "laden" && <p>Laden…</p>}
      {status === "fout" && <p style={{ color: "var(--theme-error-500)" }}>Ophalen mislukt. Herlaad de pagina.</p>}

      {status === "klaar" && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--theme-elevation-150)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Type</th>
              <th style={{ padding: "0.5rem" }}>Publieke titel</th>
              <th style={{ padding: "0.5rem", minWidth: 220 }}>Categorie</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Download zichtbaar</th>
              <th style={{ padding: "0.5rem", width: 100 }}>Volgorde</th>
              <th style={{ padding: "0.5rem" }}>Bewerken</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((rij) => (
              <tr
                key={rij.key}
                style={{
                  borderBottom: "1px solid var(--theme-elevation-100)",
                  background: rij.gewijzigd ? "var(--theme-elevation-50)" : undefined,
                }}
              >
                <td style={{ padding: "0.5rem" }}>{rij.type === "handleiding" ? "Handleiding" : "PDF"}</td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={rij.titel}
                    onChange={(e) => werkRijBij(rij.key, { titel: e.target.value })}
                    style={{
                      width: "100%",
                      minWidth: 220,
                      padding: "0.4rem",
                      border: "1px solid var(--theme-elevation-150)",
                      borderRadius: "4px",
                      background: "var(--theme-input-bg)",
                      color: "inherit",
                    }}
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <SelectInput
                    path={`categorie-${rij.key}`}
                    name={`categorie-${rij.key}`}
                    options={categorieOpties}
                    value={rij.categorie === null ? "" : String(rij.categorie)}
                    onChange={(optie) => {
                      const gekozen = Array.isArray(optie) ? optie[0] : optie;
                      const waarde = gekozen && "value" in gekozen ? gekozen.value : "";
                      werkRijBij(rij.key, { categorie: waarde ? Number(waarde) : null });
                    }}
                  />
                </td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>
                  <CheckboxInput
                    id={`zichtbaar-${rij.key}`}
                    checked={rij.zichtbaar}
                    onToggle={(e) => werkRijBij(rij.key, { zichtbaar: e.target.checked })}
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="number"
                    value={rij.volgorde ?? ""}
                    onChange={(e) =>
                      werkRijBij(rij.key, { volgorde: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    style={{
                      width: "100%",
                      padding: "0.4rem",
                      border: "1px solid var(--theme-elevation-150)",
                      borderRadius: "4px",
                      background: "var(--theme-input-bg)",
                      color: "inherit",
                    }}
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <a
                    href={
                      rij.type === "handleiding"
                        ? `/admin/collections/handleidingen/${rij.id}`
                        : `/admin/collections/knowledge-sources/${rij.id}`
                    }
                  >
                    Bewerken
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Gutter>
  );
}
