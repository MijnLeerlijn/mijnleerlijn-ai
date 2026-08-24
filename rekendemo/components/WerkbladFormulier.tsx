"use client";

import { useState } from "react";
import { Veld, VeldGroep } from "./ui/Veld";
import { KeuzeKaarten } from "./ui/KeuzeKaarten";
import { SegmentKeuze } from "./ui/SegmentKeuze";
import { Keuzelijst, Tekstvlak } from "./ui/Invoer";
import { Toggle } from "./ui/Toggle";
import { Knop } from "./ui/Knop";
import {
  AANTALLEN_OPGAVEN,
  EILANDEN,
  LEERJAREN,
  OPGAVE_TYPEN,
  bevatTekeningen,
  standaardTaalVoorEiland,
  talenVoorEiland,
  type AantalOpgaven,
  type EilandId,
  type LeerjaarId,
  type WerkbladInstellingen,
} from "@/lib/werkblad";

type WerkbladFormulierProps = {
  waarden: WerkbladInstellingen;
  onWijzig: (wijziging: Partial<WerkbladInstellingen>) => void;
  onVerstuur: () => void;
};

export function WerkbladFormulier({
  waarden,
  onWijzig,
  onVerstuur,
}: WerkbladFormulierProps) {
  const [fout, setFout] = useState<string | null>(null);

  // Bij een ander eiland verandert ook de schrijfwijze van het Papiaments,
  // dus de taalkeuze gaat automatisch mee naar de standaardtaal van dat eiland.
  function kiesEiland(eiland: EilandId) {
    onWijzig({ eiland, taal: standaardTaalVoorEiland(eiland) });
  }

  function verstuur(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (waarden.rekendoel.trim().length === 0) {
      setFout("Vul een rekendoel in, zodat we passend materiaal kunnen maken.");
      document.getElementById("rekendoel")?.focus();
      return;
    }

    setFout(null);
    onVerstuur();
  }

  return (
    <form onSubmit={verstuur} noValidate className="space-y-8">
      <section className="rounded-card border border-line bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="space-y-8">
          <VeldGroep label="Eiland">
            <KeuzeKaarten
              naam="eiland"
              opties={EILANDEN}
              waarde={waarden.eiland}
              onChange={kiesEiland}
            />
          </VeldGroep>

          <VeldGroep
            label="Taal"
            hint="De taal waarin het werkblad wordt geschreven."
          >
            <SegmentKeuze
              naam="taal"
              opties={talenVoorEiland(waarden.eiland)}
              waarde={waarden.taal}
              onChange={(taal) => onWijzig({ taal })}
            />
          </VeldGroep>

          <Veld
            id="rekendoel"
            label="Rekendoel"
            verplicht
            hint="Beschrijf in je eigen woorden wat de leerlingen moeten kunnen."
            fout={fout ?? undefined}
          >
            <Tekstvlak
              id="rekendoel"
              name="rekendoel"
              rows={4}
              required
              aria-describedby={fout ? "rekendoel-fout" : "rekendoel-hint"}
              aria-invalid={fout ? true : undefined}
              value={waarden.rekendoel}
              onChange={(event) => {
                if (fout) setFout(null);
                onWijzig({ rekendoel: event.target.value });
              }}
              placeholder="Bijvoorbeeld: Ik kan geldbedragen tot 100 optellen en aftrekken."
            />
          </Veld>

          <Veld id="leerjaar" label="Leerjaar">
            <Keuzelijst
              id="leerjaar"
              name="leerjaar"
              value={waarden.leerjaar}
              onChange={(event) =>
                onWijzig({ leerjaar: Number(event.target.value) as LeerjaarId })
              }
            >
              {LEERJAREN.map((optie) => (
                <option key={optie.id} value={optie.id}>
                  {optie.label}
                </option>
              ))}
            </Keuzelijst>
          </Veld>
        </div>
      </section>

      <section className="rounded-card border border-line bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="space-y-8">
          <VeldGroep label="Type opgaven">
            <KeuzeKaarten
              naam="opgaveType"
              opties={OPGAVE_TYPEN}
              waarde={waarden.opgaveType}
              onChange={(opgaveType) => onWijzig({ opgaveType })}
              kolommen={3}
            />
          </VeldGroep>

          <VeldGroep label="Aantal opgaven">
            <SegmentKeuze
              naam="aantalOpgaven"
              opties={AANTALLEN_OPGAVEN.map((aantal) => ({
                id: aantal,
                label: String(aantal),
              }))}
              waarde={waarden.aantalOpgaven}
              onChange={(aantalOpgaven) =>
                onWijzig({ aantalOpgaven: aantalOpgaven as AantalOpgaven })
              }
            />
          </VeldGroep>

          <div className="rounded-2xl bg-accent-soft/70 px-5 py-4">
            <h3 className="text-sm font-semibold text-ink">Tekeningen</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Bij verhaalsommen maken we automatisch een passende educatieve tekening.
            </p>
            {!bevatTekeningen(waarden.opgaveType) ? (
              <p className="mt-2 text-sm text-ink-muted">
                Je hebt alleen kale sommen gekozen — dit werkblad krijgt dus geen
                tekeningen.
              </p>
            ) : null}
          </div>

          <Veld
            id="tekenwens"
            label="Wat wil je in de tekeningen zien?"
            hint="Optioneel. Bijvoorbeeld: kinderen op een lokale markt met mango's en watermeloenen."
          >
            <Tekstvlak
              id="tekenwens"
              name="tekenwens"
              rows={3}
              aria-describedby="tekenwens-hint"
              value={waarden.tekenwens}
              onChange={(event) => onWijzig({ tekenwens: event.target.value })}
              placeholder="Laat leeg als wij zelf een passende situatie mogen kiezen."
            />
          </Veld>

          <Toggle
            id="antwoordenblad"
            label="Antwoordenblad"
            hint="Voegt een apart blad met de antwoorden toe voor de leerkracht."
            aan={waarden.antwoordenblad}
            onChange={(antwoordenblad) => onWijzig({ antwoordenblad })}
          />
        </div>
      </section>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Knop type="submit" className="w-full sm:w-auto">
          Genereer werkblad
        </Knop>
        <p className="text-sm text-ink-muted">
          Je kunt je keuzes daarna nog aanpassen.
        </p>
      </div>
    </form>
  );
}
