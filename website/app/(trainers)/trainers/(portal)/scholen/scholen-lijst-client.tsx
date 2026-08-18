"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import type { TrainerSchoolSamenvatting } from "@/lib/trainers/monday-links";
import { formatKorteDatum } from "@/lib/sales/format-datum";

// Traineromgeving V1, Ronde 2 (2026-08-19) — client-eiland uitsluitend voor
// de zoekbalk (zelfde "server haalt op, client-eiland rendert" -opsplitsing
// als trainer-portal-nav.tsx elders in deze portal): scholen/page.tsx blijft
// de server-side auth-gate + ÉÉN live Monday-fetch; deze component filtert
// uitsluitend in-memory op de al opgehaalde, al Nederlands-alfabetisch
// gesorteerde (bepaalScholenVoorTrainer, monday-links.ts se
// localeCompare(..., "nl")) lijst — nooit een Monday-aanroep per
// toetsaanslag.
function StatusTelling({ aantal, label, kleurKlasse }: { aantal: number; label: string; kleurKlasse: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-medium ${kleurKlasse}`}>
      {aantal} {label}
    </span>
  );
}

function SchoolKaart({ school }: { school: TrainerSchoolSamenvatting }) {
  return (
    <Link
      href={`/scholen/${school.id}`}
      className="flex flex-col gap-3 rounded-xl border border-grijs-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-200 hover:shadow-md"
    >
      <div>
        <h3 className="text-h3 font-semibold text-grijs-900">{school.naam}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-body-sm text-grijs-600">
          {school.onderwijstype && <span>{school.onderwijstype}</span>}
          {school.onderwijstype && school.locatie && <span aria-hidden>·</span>}
          {school.locatie && (
            <span className="flex items-center gap-1">
              <MapPin size={13} />
              {school.locatie}
            </span>
          )}
          {!school.onderwijstype && !school.locatie && <span>—</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <StatusTelling aantal={school.aantalOpen} label="open" kleurKlasse="bg-amber-50 text-amber-700" />
        <StatusTelling aantal={school.aantalGepland} label="gepland" kleurKlasse="bg-blue-50 text-blue-700" />
        <StatusTelling aantal={school.aantalGedaan} label="gedaan" kleurKlasse="bg-green-50 text-green-700" />
      </div>

      {school.eerstvolgendeTraining && (
        <p className="text-body-sm text-grijs-600">
          Eerstvolgende: <span className="font-medium text-grijs-900">{formatKorteDatum(school.eerstvolgendeTraining.datum)}</span> —{" "}
          {school.eerstvolgendeTraining.naam}
        </p>
      )}
    </Link>
  );
}

export default function ScholenLijstClient({ scholen }: { scholen: TrainerSchoolSamenvatting[] }) {
  const [zoekterm, setZoekterm] = useState("");

  const genormaliseerdeZoekterm = zoekterm.trim().toLowerCase();
  const gefilterd = genormaliseerdeZoekterm
    ? scholen.filter((school) => school.naam.toLowerCase().includes(genormaliseerdeZoekterm))
    : scholen;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grijs-400" />
        <input
          type="search"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          placeholder="Zoek op schoolnaam…"
          aria-label="Zoek op schoolnaam"
          className="w-full rounded-lg border border-grijs-300 py-2 pl-9 pr-3 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
        />
      </div>

      {gefilterd.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          Geen scholen gevonden voor &ldquo;{zoekterm}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {gefilterd.map((school) => (
            <SchoolKaart key={school.id} school={school} />
          ))}
        </div>
      )}
    </div>
  );
}
