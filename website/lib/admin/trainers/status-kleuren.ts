import type { NavColor } from "@/lib/admin-nav/nav-colors";
import type { AdminTrainerVerslagRegel, AdminTelefonieOproepStatus } from "./trainerdetail";
import type { AdminAandachtSoort } from "./aandacht";
import type { AdminActiviteitSoort } from "./activiteit";
import type { TodoItem } from "@/lib/trainers/dashboard";
import type { TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";

// Visuele polishronde (2026-08-24) — enige bron van waarheid voor
// statuskleur binnen het Admin Trainerdashboard. Puur presentatie: welke
// bestaande status welke van de 9 bestaande merkkleuren
// (lib/data/categorie-kleuren.ts, via NAV_COLOR_STYLES) krijgt. Geen nieuwe
// statussen, geen nieuwe kleuren — uitsluitend een mapping bovenop wat er
// al is. Vaste betekenis (opdrachtseis): groen = afgerond/goed, oranje =
// actie nodig/open, rood = fout/mislukt, blauw/teal = informatief/gepland.
// Alleen TYPE-only imports uit de overige lib/admin/trainers/*-bestanden
// (server-georiënteerd, maar types worden altijd volledig weg-compileerd —
// zelfde redenering als elders in dit project, zie TrainerDetailView.tsx se
// toelichting bij LOGBOEK_TYPE_LABEL voor het omgekeerde/onveilige geval
// van een VALUE-import).

export const VERSLAG_STATUS_KLEUR: Record<AdminTrainerVerslagRegel["status"], NavColor> = {
  concept: "orange",
  gedeeltelijk: "orange",
  bevestigd: "green",
  voltooid: "green",
};

export const WRITEBACK_STATUS_KLEUR: Record<AdminTrainerVerslagRegel["trainingUpdateStatus"], NavColor> = {
  niet_verzonden: "slate",
  bezig: "blue",
  geschreven: "green",
  mislukt: "red",
  niet_geactiveerd: "slate",
};

export const TELEFONIE_STATUS_KLEUR: Record<AdminTelefonieOproepStatus, NavColor> = {
  ontvangen: "blue",
  trainer_herkend: "blue",
  training_gekozen: "blue",
  opname_verwacht: "blue",
  opname_ontvangen: "blue",
  transcriptie_bezig: "blue",
  transcriptie_mislukt_herstelbaar: "orange",
  concept_klaar: "green",
  verslag_bestaat_al: "green",
  mislukt: "red",
};

// "vandaag" bewust oranje, niet blauw — zelfde urgentie-conventie als de
// bestaande .ml-sales-widget__urgentie--vandaag (admin-shell.css): vandaag
// geplande training vraagt op de dag zelf net iets meer aandacht dan een
// verder-weg geplande ("komend"/"open").
export const WEERGAVE_STATUS_KLEUR: Record<TrainingWeergaveStatus, NavColor> = {
  open: "blue",
  vandaag: "orange",
  komend: "blue",
  verslag_nog_invullen: "orange",
  gedaan: "green",
  geannuleerd: "slate",
};

// Alle drie zijn per definitie een aandachtspunt (spec §7) — mislukte
// telefonie is de enige harde fout (rood), de andere twee zijn "moet nog
// gebeuren" (oranje), consistent met AdminTodoItem hieronder waar
// "verslag_vastgelopen" hetzelfde onderliggende begrip is.
export const AANDACHT_SOORT_KLEUR: Record<AdminAandachtSoort, NavColor> = {
  telefonie_mislukt: "red",
  verslag_vastgelopen: "orange",
  concept_oud: "orange",
};

export const TODO_SOORT_KLEUR: Record<TodoItem["soort"], NavColor> = {
  telefonisch_concept: "teal",
  verslag_vastgelopen: "orange",
  concept_gestart: "orange",
  verslag_ontbreekt: "orange",
};

// Bewust rustig: alleen de ene echte foutstatus (telefonie_mislukt) krijgt
// een afwijkende kleur, de rest blijft één kalme informatieve tint — spec
// §8/§2: opvallen moet uitzondering blijven, niet de norm.
export function activiteitSoortKleur(soort: AdminActiviteitSoort): NavColor {
  return soort === "telefonie_mislukt" ? "red" : "teal";
}

export function trainerActiefKleur(actief: boolean): NavColor {
  return actief ? "green" : "slate";
}
