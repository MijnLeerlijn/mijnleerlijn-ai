"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import Label from "@/components/atoms/Label";
import Button from "@/components/atoms/Button";
import ContactField from "@/components/molecules/ContactField";
import { useToast } from "@/providers/ToastProvider";

const soortVraagOpties = [
  "Ik snap iets niet",
  "Ik denk dat er iets stuk is",
  "Ik heb een suggestie",
  "Anders",
];

interface ContactFormProps {
  /** Voorgevuld vanuit de "geen betrouwbaar antwoord"-flow (zie NoAnswerState / /contact?onderwerp=…). */
  initieelOnderwerp?: string;
}

// Zie docs/UX-DESIGN.md scherm 5 en docs/SECURITY-AND-PRIVACY.md. Verstuurt
// echt naar app/api/contact/route.ts (server-side validatie, opslag,
// e-mailnotificatie, spam-/rate-limiting — zie Fase 4 Stap 8). Het
// "website"-veld is een honeypot: onzichtbaar voor mensen (via CSS, niet
// via `hidden`/`display:none`, wat sommige bots negeren), maar bots die elk
// veld invullen lopen er wel in.
export default function ContactForm({ initieelOnderwerp }: ContactFormProps) {
  const { showToast } = useToast();
  const [versturen, setVersturen] = useState(false);
  const [verstuurd, setVerstuurd] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const selectId = useId();
  const fileId = useId();

  const onVersturen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVersturen(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/contact", { method: "POST", body: formData });
      const resultaat = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !resultaat.ok) {
        showToast(
          "fout",
          resultaat.error ?? "Er ging iets mis bij het versturen. Probeer het later opnieuw."
        );
        return;
      }

      setVerstuurd(true);
      formRef.current?.reset();
      showToast("succes", "Bedankt! We nemen zo snel mogelijk contact met je op.");
    } catch {
      showToast(
        "fout",
        "Er ging iets mis bij het versturen. Controleer je verbinding en probeer het opnieuw."
      );
    } finally {
      setVersturen(false);
    }
  };

  if (verstuurd) {
    return (
      <div className="max-w-[560px] rounded-lg border border-groen/20 bg-groen/5 p-6">
        <p className="text-base font-semibold text-grijs-900">Je bericht is verstuurd.</p>
        <p className="mt-1 text-sm text-grijs-600">We nemen persoonlijk contact met je op.</p>
        <Button variant="secondary" size="compact" className="mt-4" onClick={() => setVerstuurd(false)}>
          Nog een bericht sturen
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onVersturen} className="flex max-w-[700px] flex-col gap-8">
      <div className="absolute -left-[9999px]" aria-hidden>
        <label htmlFor="website">Laat dit veld leeg</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <h2 className="text-h3 font-semibold text-grijs-900">Wie ben je</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ContactField label="Naam leerkracht" name="naam" required placeholder="Voor- en achternaam" />
          <ContactField label="E-mail" name="email" required placeholder="naam@school.nl" />
          <ContactField label="Naam school" name="school" required placeholder="Naam van je school" />
        </div>
      </div>

      <div>
        <h2 className="text-h3 font-semibold text-grijs-900">Wat is het probleem</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor={selectId} required>
              Soort vraag
            </Label>
            <select
              id={selectId}
              name="soortVraag"
              required
              defaultValue={initieelOnderwerp ? "Ik snap iets niet" : undefined}
              className="h-10 w-full rounded-md border border-grijs-200 bg-white px-3 text-base text-grijs-900 outline-none transition-colors duration-[120ms] focus:border-2 focus:border-[var(--variant-accent)]"
            >
              {soortVraagOpties.map((optie) => (
                <option key={optie} value={optie}>
                  {optie}
                </option>
              ))}
            </select>
          </div>
          <ContactField
            label="Onderwerp"
            name="onderwerp"
            required
            placeholder="Korte samenvatting"
            defaultValue={initieelOnderwerp}
          />
          <ContactField label="Uitleg van het probleem" name="uitleg" required multiline rows={4} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ContactField label="Wat verwacht je?" name="verwacht" multiline rows={3} />
            <ContactField label="Wat zie je daadwerkelijk?" name="ziet" multiline rows={3} />
          </div>
          <ContactField
            label="URL van de softwarepagina"
            name="url"
            placeholder="https://mijnleerlijn.nl/..."
          />

          <div>
            <Label htmlFor={fileId}>Schermafbeelding toevoegen (optioneel)</Label>
            <input
              id={fileId}
              name="bijlagen"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="mt-1 block w-full text-sm text-grijs-600 file:mr-3 file:rounded-md file:border-0 file:bg-grijs-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-grijs-900 hover:file:bg-grijs-200"
            />
            <p className="mt-1 text-xs text-grijs-400">
              Maximaal 3 bestanden, elk max. 10MB (afbeelding of pdf).
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-oranje/20 bg-oranje/5 p-3">
            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-oranje" />
            <p className="text-sm text-grijs-900">
              Voer geen leerling- of medische gegevens in, ook niet in schermafbeeldingen.
            </p>
          </div>
        </div>
      </div>

      <div>
        <Button type="submit" variant="primary" size="groot" loading={versturen}>
          Versturen
        </Button>
      </div>
    </form>
  );
}
