import { TekstBlock } from "./tekst";
import { GenummerdeStapBlock } from "./genummerdeStap";
import { AfbeeldingBlock } from "./afbeelding";
import { WaarschuwingBlock } from "./waarschuwing";
import { TipBlock } from "./tip";
import { VideoBlock } from "./video";
import { DownloadBlock } from "./download";
import { ContactDoorverwijzingBlock } from "./contactDoorverwijzing";

// De 8 canonieke ContentBlock-types uit docs/DATA-MODEL.md, als Payload
// Blocks-veldtype — zie docs/CMS-AND-EDITORIAL-WORKFLOW.md §CMS-aanpak &
// motivatie. Gebruikt binnen Sections (zie payload/collections/Articles.ts).
export const contentBlocks = [
  TekstBlock,
  GenummerdeStapBlock,
  AfbeeldingBlock,
  WaarschuwingBlock,
  TipBlock,
  VideoBlock,
  DownloadBlock,
  ContactDoorverwijzingBlock,
];
