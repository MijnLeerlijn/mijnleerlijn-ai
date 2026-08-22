import { Sparkles, PhoneIncoming, LifeBuoy, Users, StickyNote, FileText, type LucideIcon } from "lucide-react";
import type { ActiviteitSoort } from "./activiteit";

// Traineromgeving V2, Fase 1 (2026-08-28) — één gedeelde icoon/label/kleur-
// mapping voor ActiviteitSoort, gebruikt door zowel de dashboard-sectie
// "Recente activiteit" als de volledige /logboek-tijdlijn: "maak duidelijk
// visueel onderscheid tussen Training, Telefonisch, Helpdesk, Overleg,
// Notitie" (opdrachtseis) mag geen twee keer een eigen interpretatie krijgen.
// Zelfde precedent als lib/trainers/status-styles.ts.
export const ACTIVITEIT_LABEL: Record<ActiviteitSoort, string> = {
  training: "Training",
  telefonisch: "Telefonisch",
  helpdesk: "Helpdesk",
  overleg: "Overleg",
  notitie: "Notitie",
  overig: "Overig",
};

export const ACTIVITEIT_ICOON: Record<ActiviteitSoort, LucideIcon> = {
  training: Sparkles,
  telefonisch: PhoneIncoming,
  helpdesk: LifeBuoy,
  overleg: Users,
  notitie: StickyNote,
  overig: FileText,
};

/** Vlakgevulde badge-kleur — zelfde compacte rounded-full-vorm als TRAINING_STATUS_BADGE (status-styles.ts). */
export const ACTIVITEIT_KLEUR: Record<ActiviteitSoort, string> = {
  training: "bg-teal-50 text-teal-700",
  telefonisch: "bg-teal-50 text-teal-700",
  helpdesk: "bg-blue-50 text-blue-700",
  overleg: "bg-violet-50 text-violet-700",
  notitie: "bg-amber-50 text-amber-700",
  overig: "bg-grijs-100 text-grijs-600",
};
