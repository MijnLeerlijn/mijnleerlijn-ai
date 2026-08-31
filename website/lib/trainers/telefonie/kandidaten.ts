import type { Payload } from "payload";
import { haalRecenteTrainingenVoorTelefonie, vandaagIsoAmsterdam, TELEFONIE_RECENTE_DAGEN, type TrainingMetSchool } from "../monday-links";
import { haalVerslagenPerTraining } from "../verslag";
import { haalAanvullendeTrainingenAlsSamenvattingen } from "../aanvullende-trainingen";
import { haalStartactiesAlsSamenvattingen } from "../startbegeleiding";
import type { AuthTrainer } from "../auth";

// Trainertelefonie V1-afronding (2026-08-26) — spec §6/§16: "Centraliseer
// ALLE kandidatenlijst-logica (eigenaarschap, recente trainingen, uitsluiten
// bestaand concept/verslag, vandaag, overig recent, sortering, uiteindelijke
// telefonie-kandidaten) in ÉÉN server-side laag." DIT bestand is die laag —
// gesprek.ts roept UITSLUITEND haalTelefonieKandidaten() hieronder aan, nooit
// meer rechtstreeks haalRecenteTrainingenVoorTelefonie (die blijft
// ONGEWIJZIGD, spec §19 — dit bestand bouwt er uitsluitend bovenop).
//
// Bron van waarheid voor "bestaat er al een verslag" (spec §6, letterlijk):
// UITSLUITEND training-verslagen (via de al-bestaande, gebatchte
// haalVerslagenPerTraining — voorkomt N losse queries) — geen tweede
// statuslaag. Een rij in training-verslagen sluit een training ALTIJD uit,
// ongeacht status (concept/gedeeltelijk/bevestigd/voltooid): zelfs een kaal
// concept betekent "hier is al een verslag mee bezig", dus niet nogmaals
// aanbieden. Een training waarvan het concept vóór bevestiging is verwijderd
// (verwijderConcept, lib/trainers/verslag.ts) heeft domweg geen rij meer —
// wordt dus vanzelf weer beschikbaar, zonder dat dit bestand een aparte
// "verwijderd"-status hoeft te kennen (training-verslagen kent hard-delete,
// geen soft-delete-vlag, zie payload/collections/TrainingVerslagen.ts).

export interface TelefonieKandidaat {
  id: string;
  naam: string;
  schoolNaam: string;
  schoolId: string;
  trainerboardItemId: string | null;
  datum: string | null;
  /** Upsell-ronde (2026-09-02, spec §A5) — laat portal/admin/transcript altijd kunnen onderscheiden om welke soort training het ging. Startbegeleiding-ronde (2026-09-02, spec §E.1) voegt "startactie" toe — zelfde reden, zie TrainingSamenvatting.bron (monday-links.ts). */
  bron: "mijnleerlijn" | "aanvullend" | "startactie";
}

export interface TelefonieKandidatenResultaat {
  /** Trainingen van vandaag (spec §1: altijd eerst gecontroleerd, nooit meteen de volledige recente-lijst). */
  vandaag: TelefonieKandidaat[];
  /** Overige recente trainingen (binnen hetzelfde bestaande telefonievenster) — al gesorteerd meest-recent-eerst, spec §5. */
  ouder: TelefonieKandidaat[];
}

function naarKandidaat(t: TrainingMetSchool): TelefonieKandidaat {
  return { id: t.id, naam: t.naam, schoolNaam: t.schoolNaam, schoolId: t.schoolId, trainerboardItemId: t.trainerboardItemId, datum: t.datum, bron: t.bron };
}

/**
 * DE enige plek die bepaalt welke trainingen een trainer telefonisch mag
 * kiezen. Twee stappen: (1) haalRecenteTrainingenVoorTelefonie levert de
 * ruwe, al server-side geautoriseerde kandidatenset (ongewijzigd — trainer-
 * eigenaarschap/geannuleerd/geen-trainerboard-item/recentheidsvenster zitten
 * daar al in); (2) hier ALSNOG uitsluiten wat al een verslag heeft, en
 * splitsen in vandaag/ouder (spec §1-§6).
 */
export async function haalTelefonieKandidaten(payload: Payload, trainer: AuthTrainer): Promise<TelefonieKandidatenResultaat> {
  const [recentMonday, recentAanvullend, recentStartacties] = await Promise.all([
    haalRecenteTrainingenVoorTelefonie(trainer),
    // Upsell-ronde (2026-09-02, spec §A5) — een aanvullende training met
    // datum moet hier net zo goed als kandidaat kunnen voorkomen als een
    // MijnLeerlijn-training, zelfde recentheidsvenster (TELEFONIE_RECENTE_DAGEN).
    haalAanvullendeTrainingenAlsSamenvattingen(payload, trainer, { maxDagenGeleden: TELEFONIE_RECENTE_DAGEN }),
    // Startbegeleiding-ronde (2026-09-02, spec §E.1) — zelfde reden/venster:
    // een startactie-gesprek met een gespreksDatum moet net zo goed
    // telefonisch afgehandeld kunnen worden.
    haalStartactiesAlsSamenvattingen(payload, trainer, { maxDagenGeleden: TELEFONIE_RECENTE_DAGEN }),
  ]);
  const recent = [...recentMonday, ...recentAanvullend, ...recentStartacties];
  if (recent.length === 0) return { vandaag: [], ouder: [] };

  const verslagen = await haalVerslagenPerTraining(
    payload,
    trainer,
    recent.map((t) => t.id)
  );
  const beschikbaar = recent.filter((t) => !verslagen.has(t.id));

  const vandaag = vandaagIsoAmsterdam();
  return {
    vandaag: beschikbaar.filter((t) => t.datum === vandaag).map(naarKandidaat),
    // al meest-recent-eerst gesorteerd door haalRecenteTrainingenVoorTelefonie — hier alleen filteren, niet opnieuw sorteren.
    ouder: beschikbaar.filter((t) => t.datum !== vandaag).map(naarKandidaat),
  };
}

/**
 * Labelt kandidaten binnen ÉÉN menu-laag (spec §2/§3/§5: "bij voorkeur
 * schoolnaam, training alleen erbij als het nodig is ter onderscheid").
 * Schoolnaam alleen is de default; alleen wanneer twee of meer kandidaten
 * IN DEZELFDE LAAG dezelfde schoolnaam delen, krijgen precies die entries
 * ook de trainingnaam erbij — nooit de hele lijst, nooit wanneer het niet
 * nodig is.
 */
export function labelKandidaten(kandidaten: TelefonieKandidaat[]): string[] {
  const telling = new Map<string, number>();
  for (const k of kandidaten) telling.set(k.schoolNaam, (telling.get(k.schoolNaam) ?? 0) + 1);
  return kandidaten.map((k) => ((telling.get(k.schoolNaam) ?? 0) > 1 ? `${k.schoolNaam} — ${k.naam}` : k.schoolNaam));
}
