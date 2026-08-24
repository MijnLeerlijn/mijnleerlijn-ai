/**
 * De vaste huisstijl voor alle gegenereerde tekeningen: "moderne educatieve
 * vectorstijl". Deze tekst gaat ongewijzigd mee bij iedere beeldprompt, zodat
 * alle illustraties in een werkblad op elkaar lijken. Stijl wijzigen doe je
 * hier, op één plek.
 */
export const VASTE_STIJLPROMPT =
  "Modern educational vector illustration for a primary-school worksheet. " +
  "Clean confident outlines, simple shapes, calm friendly colour palette, subtle flat shading, " +
  "uncluttered composition, light or white background, professional textbook quality. " +
  "Natural child proportions, respectful and believable everyday setting. " +
  "Clear visual hierarchy and easy to understand at small print size. " +
  "Not photorealistic, not 3D, not anime, not overly childish. " +
  "No text, no numbers, no letters, no logos, no watermarks.";

/** Compositie-eisen zodat de tekening op een A4-werkblad blijft werken. */
export const COMPOSITIE_REGELS = [
  "One single clear scene, never a collage or multiple panels.",
  "Main subjects large enough to stay readable when printed small.",
  "Important content centred, calm and simple background.",
  "Balanced framing: neither crowded nor mostly empty space.",
  "Consistent landscape framing.",
];

/** Wat er nooit in beeld mag komen. */
export const VERBODEN_ELEMENTEN = [
  "no text, letters, numbers, digits, captions, speech bubbles, signage, logos or watermarks",
  "no tourist clichés unless the story is explicitly about them: no flamingos, cruise ships, beach scenes, prominent palm trees, carnival or tourists",
  "no photorealism, no 3D render, no anime or manga style, no babyish cartoon style",
  "no exaggerated facial expressions",
  "no visual clutter",
];

/** Kinderen in beeld: hoe ze getekend moeten worden. */
export const KINDEREN_REGELS = [
  "natural proportions, friendly and believable",
  "ordinary everyday clothing",
  "respectful diversity in skin tone and appearance",
];
