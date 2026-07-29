"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from "react";
import {
  Button,
  DragHandleIcon,
  DraggableSortable,
  DraggableSortableItem,
  Gutter,
  TextInput,
  toast,
} from "@payloadcms/ui";
import { CategorieAppearancePicker } from "./CategorieAppearancePicker";
import { STANDAARD_ICOON } from "@/lib/data/lucide-icon-lookup";
import { STANDAARD_KLEUR } from "@/lib/data/categorie-kleuren";
import type { CategorieKleur } from "@/lib/data/categories";

// Downloadcategorieën (2026-07-27): toevoegen/hernoemen/verwijderen/
// sorteren van categorieën op één plek. De volgorde hier bepaalt direct de
// categorievolgorde op de publieke downloadpagina (zie het nieuwe
// `volgorde`-veld op Categories.ts en app/api/knowledge/public-manuals/
// route.ts). Hergebruikt Payload's EIGEN DraggableSortable/-Item
// (@payloadcms/ui) — hetzelfde component dat Payload intern gebruikt voor
// array-veld-drag-reorder — i.p.v. zelf @dnd-kit rechtstreeks aan te
// spreken: zelfde interactie/visuele stijl, minder eigen code.
//
// Slepen slaat direct op (geen aparte Opslaan-knop): één sleepactie is
// altijd één zelfstandige, atomaire wijziging — anders dan de multi-veld-
// tabel in Downloadbeheer, waar batchen juist minder netwerkverkeer geeft.
// Icoon/kleur (2026-07-29) volgen hetzelfde directe-PATCH-patroon als
// `herorden()` hieronder (i.p.v. de aparte "rename"-beheerroute voor titel) —
// optimistisch bijgewerkt, met terugdraai + foutmelding bij mislukking.

interface Categorie {
  id: number;
  title: string;
  volgorde: number | null;
  icon: string;
  color: string;
}

export function DownloadcategorieenView() {
  const [categorieen, setCategorieen] = useState<Categorie[]>([]);
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuwIcoon, setNieuwIcoon] = useState<string>(STANDAARD_ICOON);
  const [nieuweKleur, setNieuweKleur] = useState<CategorieKleur>(STANDAARD_KLEUR);
  const [toevoegen, setToevoegen] = useState(false);
  // Rij-ids waarvan de icoon-/kleurpicker uitgeklapt is — standaard dicht,
  // zodat de lijst overzichtelijk blijft met meerdere categorieën.
  const [uitgeklapt, setUitgeklapt] = useState<Set<number>>(new Set());
  // Laatst-OPGESLAGEN titel per categorie-id — apart van `categorieen` zelf
  // bijgehouden. `categorieen[i].title` wordt al bij elke toetsaanslag
  // (onChange) lokaal bijgewerkt, dus die kan niet gebruikt worden om te
  // bepalen of er sinds de laatste save iets ECHT veranderd is (die
  // vergelijking zou altijd "gelijk" uitkomen en de save-op-blur stilzwijgend
  // overslaan — ontdekt tijdens live verificatie: de tekst in beeld
  // veranderde wel, de database niet).
  const opgeslagenTitels = useRef<Record<number, string>>({});

  async function laad() {
    setStatus("laden");
    try {
      const res = await fetch("/api/categories?limit=200&sort=volgorde", { credentials: "include" });
      if (!res.ok) throw new Error("Ophalen mislukt.");
      const data = (await res.json()) as { docs: Categorie[] };
      setCategorieen(data.docs);
      opgeslagenTitels.current = Object.fromEntries(data.docs.map((c) => [c.id, c.title]));
      setStatus("klaar");
    } catch {
      setStatus("fout");
    }
  }

  useEffect(() => {
    laad();
  }, []);

  async function voegToe() {
    const titel = nieuweNaam.trim();
    if (!titel) return;
    setToevoegen(true);
    try {
      const slug = titel
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const volgende = categorieen.length
        ? Math.max(...categorieen.map((c) => c.volgorde ?? 0)) + 1
        : 0;
      const res = await fetch("/api/categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titel,
          slug: `${slug}-${Date.now().toString(36)}`,
          icon: nieuwIcoon,
          color: nieuweKleur,
          description: titel,
          volgorde: volgende,
        }),
      });
      if (!res.ok) throw new Error("Aanmaken mislukt.");
      setNieuweNaam("");
      setNieuwIcoon(STANDAARD_ICOON);
      setNieuweKleur(STANDAARD_KLEUR);
      toast.success(`Categorie "${titel}" toegevoegd.`);
      await laad();
    } catch {
      toast.error("Categorie aanmaken is mislukt.");
    } finally {
      setToevoegen(false);
    }
  }

  async function wijzigUiterlijk(categorie: Categorie, patch: { icon?: string; color?: CategorieKleur }) {
    const vorig = { icon: categorie.icon, color: categorie.color };
    setCategorieen((huidig) => huidig.map((c) => (c.id === categorie.id ? { ...c, ...patch } : c)));
    try {
      const res = await fetch(`/api/categories/${categorie.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Opslaan van icoon/kleur is mislukt.");
      setCategorieen((huidig) => huidig.map((c) => (c.id === categorie.id ? { ...c, ...vorig } : c)));
    }
  }

  function toggleUitgeklapt(id: number) {
    setUitgeklapt((huidig) => {
      const nieuw = new Set(huidig);
      if (nieuw.has(id)) nieuw.delete(id);
      else nieuw.add(id);
      return nieuw;
    });
  }

  async function hernoem(categorie: Categorie, nieuweTitel: string) {
    const schoon = nieuweTitel.trim();
    if (!schoon || schoon === opgeslagenTitels.current[categorie.id]) return;
    try {
      // Downloadcategorieën-fix (2026-07-28): gecontroleerde beheerroute
      // i.p.v. rechtstreeks PATCH naar /api/categories/:id — zie
      // app/api/download-categories/rename/route.ts voor de reden
      // (dezelfde categorie van opslagfouten als eerder bij
      // knowledge-sources).
      const res = await fetch("/api/download-categories/rename", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: categorie.id, title: schoon }),
      });
      if (!res.ok) throw new Error();
      opgeslagenTitels.current[categorie.id] = schoon;
      setCategorieen((huidig) => huidig.map((c) => (c.id === categorie.id ? { ...c, title: schoon } : c)));
    } catch {
      toast.error("Hernoemen is mislukt.");
      await laad();
    }
  }

  async function verwijder(categorie: Categorie) {
    if (!window.confirm(`Categorie "${categorie.title}" verwijderen?`)) return;
    try {
      // Server-side gebruikscontrole zit in de route zelf (niet meer
      // client-side telInGebruik() vooraf — race-condition-gevoelig en
      // gaf geen betrouwbare foutmelding bij een druk-op-druk-scenario).
      const res = await fetch("/api/download-categories/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: categorie.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error || "Verwijderen is mislukt.");
        return;
      }
      toast.success(`Categorie "${categorie.title}" verwijderd.`);
      await laad();
    } catch {
      toast.error("Verwijderen is mislukt.");
    }
  }

  async function herorden(moveFromIndex: number, moveToIndex: number) {
    const herschikt = [...categorieen];
    const [verplaatst] = herschikt.splice(moveFromIndex, 1);
    herschikt.splice(moveToIndex, 0, verplaatst!);
    const metNieuweVolgorde = herschikt.map((c, i) => ({ ...c, volgorde: i }));
    setCategorieen(metNieuweVolgorde);

    try {
      await Promise.all(
        metNieuweVolgorde.map((c, i) =>
          c.volgorde === categorieen.find((orig) => orig.id === c.id)?.volgorde
            ? Promise.resolve()
            : fetch(`/api/categories/${c.id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ volgorde: i }),
              })
        )
      );
    } catch {
      toast.error("Volgorde opslaan is mislukt.");
      await laad();
    }
  }

  return (
    <Gutter>
      <h1 style={{ marginBottom: "0.25rem" }}>Downloadcategorieën</h1>
      <p style={{ color: "var(--theme-elevation-500)", marginTop: 0 }}>
        De volgorde hier bepaalt direct hoe categorieën op de publieke downloadpagina verschijnen.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          margin: "1rem 0",
          padding: "0.75rem",
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: "4px",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <TextInput
              path="nieuweCategorie"
              label="Nieuwe categorie"
              value={nieuweNaam}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNieuweNaam(e.target.value)}
              placeholder="Naam van de categorie"
            />
          </div>
          <Button buttonStyle="secondary" disabled={!nieuweNaam.trim() || toevoegen} onClick={voegToe}>
            + Toevoegen
          </Button>
        </div>
        <CategorieAppearancePicker
          categorieNaam={nieuweNaam}
          icon={nieuwIcoon}
          color={nieuweKleur}
          onIconChange={setNieuwIcoon}
          onColorChange={setNieuweKleur}
        />
      </div>

      {status === "laden" && <p>Laden…</p>}
      {status === "fout" && <p style={{ color: "var(--theme-error-500)" }}>Ophalen mislukt. Herlaad de pagina.</p>}

      {status === "klaar" && (
        <DraggableSortable
          ids={categorieen.map((c) => String(c.id))}
          onDragEnd={({ moveFromIndex, moveToIndex }) => herorden(moveFromIndex, moveToIndex)}
        >
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {categorieen.map((categorie) => (
              <DraggableSortableItem key={categorie.id} id={String(categorie.id)}>
                {({ attributes, listeners, setNodeRef, transform, transition }) => (
                  <li
                    ref={setNodeRef}
                    style={{
                      transform,
                      transition,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                      padding: "0.5rem 0.75rem",
                      border: "1px solid var(--theme-elevation-150)",
                      borderRadius: "4px",
                      background: "var(--theme-input-bg)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span {...attributes} {...listeners} style={{ display: "flex" }}>
                        <DragHandleIcon />
                      </span>
                      <div
                        style={{ flex: 1 }}
                        onBlur={(e: FocusEvent<HTMLDivElement>) => {
                          const input = e.target as HTMLInputElement;
                          if (input.tagName === "INPUT") hernoem(categorie, input.value);
                        }}
                      >
                        <TextInput
                          path={`categorie-${categorie.id}`}
                          value={categorie.title}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setCategorieen((huidig) =>
                              huidig.map((c) => (c.id === categorie.id ? { ...c, title: e.target.value } : c))
                            )
                          }
                        />
                      </div>
                      <Button buttonStyle="secondary" size="small" onClick={() => toggleUitgeklapt(categorie.id)}>
                        {uitgeklapt.has(categorie.id) ? "Icoon & kleur sluiten" : "Icoon & kleur"}
                      </Button>
                      <Button buttonStyle="secondary" size="small" onClick={() => verwijder(categorie)}>
                        Verwijderen
                      </Button>
                    </div>
                    {uitgeklapt.has(categorie.id) && (
                      <div style={{ paddingLeft: "1.85rem" }}>
                        <CategorieAppearancePicker
                          categorieNaam={categorie.title}
                          icon={categorie.icon}
                          color={categorie.color}
                          onIconChange={(icoon) => wijzigUiterlijk(categorie, { icon: icoon })}
                          onColorChange={(kleur) => wijzigUiterlijk(categorie, { color: kleur })}
                        />
                      </div>
                    )}
                  </li>
                )}
              </DraggableSortableItem>
            ))}
          </ul>
        </DraggableSortable>
      )}
    </Gutter>
  );
}
