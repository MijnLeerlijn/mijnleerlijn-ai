"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Client Component met een rechtstreekse fetch() naar Payload's eigen,
// native /api/trainers/login — bewust GEEN @payloadcms/ui-hergebruik (zoals
// BeheerLoginView.tsx dat wél doet): die componenten verwachten Payload's
// eigen RootLayout/config-providercontext (app/(payload)/layout.tsx), die
// buiten deze subboom niet bestaat. Deze pagina leeft bewust BUITEN de
// auth-gate in ../(portal)/layout.tsx (zie dat bestand) zodat een
// uitgelogde trainer hier nooit in een redirect-lus terechtkomt.
export default function TrainerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBezig(true);
    setFoutmelding(null);

    try {
      const response = await fetch("/api/trainers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: wachtwoord }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const serverMelding = body?.errors?.[0]?.message;
        // Payload's LockedAuth-fout (node_modules/payload/dist/errors/LockedAuth.js)
        // gebruikt HTTP 401 — HETZELFDE statuscode als een gewoon fout wachtwoord — dus
        // GEEN statuscode-onderscheid mogelijk (live geverifieerd: eerst ten onrechte op
        // 423 gecontroleerd, wat de "geblokkeerd"-melding nooit liet zien). formatErrors()
        // (node_modules/payload/dist/express/formatErrors.js) laat bovendien geen
        // structured error-`name` door voor een APIError zonder `data` — alleen de tekst.
        // Vandaar een tekstcontrole (defensief: bij een onbekende foutmelding valt dit
        // terug op de neutrale, altijd-correcte generieke melding, nooit een verkeerde).
        const isGeblokkeerd = typeof serverMelding === "string" && serverMelding.toLowerCase().includes("locked");
        setFoutmelding(
          isGeblokkeerd
            ? "Dit account is tijdelijk geblokkeerd na te veel mislukte inlogpogingen. Probeer het over enkele minuten opnieuw."
            : typeof serverMelding === "string"
              ? serverMelding
              : "Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord."
        );
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setFoutmelding("Er ging iets mis bij het inloggen. Controleer je internetverbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-grijs-200 bg-white p-8 shadow-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/brand/beeldmerk-kleur.png" alt="" width={44} height={44} className="h-11 w-11" />
          <div>
            <h1 className="font-display text-h2 font-bold text-donkerblauw">Trainerportal</h1>
            <p className="mt-1 text-body-sm text-grijs-600">Log in met je trainersaccount.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-label font-medium uppercase tracking-wide text-grijs-600">
              E-mailadres
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-grijs-300 px-3 py-2 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="wachtwoord" className="text-label font-medium uppercase tracking-wide text-grijs-600">
              Wachtwoord
            </label>
            <input
              id="wachtwoord"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={wachtwoord}
              onChange={(event) => setWachtwoord(event.target.value)}
              className="rounded-lg border border-grijs-300 px-3 py-2 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          {foutmelding && (
            <p role="alert" className="rounded-lg bg-rood/10 px-3 py-2 text-body-sm text-rood">
              {foutmelding}
            </p>
          )}

          <button
            type="submit"
            disabled={bezig}
            className="mt-2 rounded-lg bg-teal-600 px-4 py-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bezig ? "Bezig met inloggen…" : "Inloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
