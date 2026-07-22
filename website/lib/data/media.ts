import type { Media } from "@/types/content";

// Er bestaat nog geen echte beeldbank (Brand/images/ is leeg, zie
// docs/DESIGN-SYSTEM.md §Ontbreekt). Elke geregistreerde Media heeft daarom
// `url: ""` — componenten die een url leeg aantreffen tonen PlaceholderFoto
// (zie components/atoms/PlaceholderFoto.tsx), nooit een verzonnen afbeelding.
let teller = 0;
export const mediaStore: Media[] = [];

export function registreerMedia(altText: string, type: Media["type"] = "afbeelding"): Media {
  teller += 1;
  const media: Media = { id: `media-${teller}`, url: "", altText, type };
  mediaStore.push(media);
  return media;
}

export function zoekMedia(id: string): Media | undefined {
  return mediaStore.find((m) => m.id === id);
}

/**
 * Registreert een reeds bekende Media (bv. opgehaald via services/payload.ts,
 * met een echte Payload-document-id) zodat zoekMedia() ook echte content kan
 * opzoeken — dezelfde opzoekfunctie voor dummydata én Payload-data, zie
 * ArtikelBlok.tsx.
 */
export function registreerOpgelosteMedia(media: Media): Media {
  const bestaand = mediaStore.findIndex((m) => m.id === media.id);
  if (bestaand >= 0) mediaStore[bestaand] = media;
  else mediaStore.push(media);
  return media;
}
