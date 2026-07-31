import type { Adapter } from "@payloadcms/plugin-cloud-storage/types";
import { uploadMediaBestand, verwijderBijlage } from "@/services/storage";
import { isPrivateBlobUrl, privateBlobPathname } from "@/lib/knowledge/process-source";

// Uniforme private-uploadarchitectuur (2026-07-31) — vervangt
// @payloadcms/storage-vercel-blob (ondersteunde uitsluitend 'public'-
// toegang, botste met de bewust private mijnleerlijn-media-store, zie de
// analyse in app/api/knowledge-sources/upload-file/route.ts). Deze adapter
// hergebruikt @payloadcms/plugin-cloud-storage — hetzelfde, al door Payload
// zelf gebouwde en beproefde raamwerk dat de OUDE plugin ook gebruikte
// (multi-file-orchestratie, vervang-opruiming, infinite-loop-bescherming) —
// en vervangt uitsluitend de daadwerkelijke opslag-I/O door
// services/storage.ts's al bestaande, private-upload-functies (dezelfde
// functies die Downloadbeheer's PDF-upload al gebruikt). Geen tweede
// implementatie van "hoe upload je privé naar Vercel Blob".
//
// Bewust GEEN imageSizes/thumbnail-varianten (zie payload/collections/
// Media.ts): niets in de applicatie leest media.sizes.*.url, en de
// generieke handleUpload-return-merge van het cloud-storage-raamwerk kan
// meerdere gelijktijdige bestanden (hoofdbestand + varianten) niet correct
// samenvoegen zonder een deterministische, vooraf-berekenbare generateURL
// (die hier niet zinvol is voor een store met willekeurige, unieke sleutels
// per upload). Met precies één bestand per upload is dat geen probleem.
//
// url-veld: deze adapter zet GEEN `disablePayloadAccessControl` en geeft
// geen `generateURL` op — de url-beforeChange-hook van het raamwerk laat de
// waarde dan ongemoeid (`let url = value; ...` in
// node_modules/@payloadcms/plugin-cloud-storage/dist/hooks/beforeChange.js),
// dus de url die handleUpload hieronder teruggeeft (en die via
// payload.update() wordt opgeslagen) blijft gewoon staan. Dat opgeslagen
// veld is en blijft de ECHTE, private Blob-URL — nooit rechtstreeks als
// publiek bruikbare link gebruiken; zie app/api/media/[id]/route.ts en
// services/payload.ts's mediaUrl() voor de stabiele, publiek te gebruiken
// tegenhanger.
export const privateBlobAdapter: Adapter = () => ({
  name: "private-vercel-blob-media",

  handleUpload: async ({ file }) => {
    const geupload = await uploadMediaBestand(file.buffer, {
      filename: file.filename,
      mimeType: file.mimeType,
    });
    return { url: geupload.url };
  },

  handleDelete: async ({ doc, filename }) => {
    // `doc` is hier ofwel het zojuist verwijderde document (afterDelete),
    // ofwel het vorige document bij een vervanging (afterChange met een
    // nieuw bestand) — in beide gevallen is `doc.url` de private Blob-URL
    // van PRECIES het bestand dat `filename` aanduidt (geen groottevarianten
    // hier, zie hierboven, dus geen sizes-opzoeking nodig).
    const url = typeof doc.url === "string" ? doc.url : null;
    if (!url || doc.filename !== filename || !isPrivateBlobUrl(url)) return;
    await verwijderBijlage(privateBlobPathname(url));
  },

  // Nooit aangeroepen in de normale werking: deze adapter zet géén
  // disablePayloadAccessControl, dus Payload's eigen (beschermde) statische
  // route wordt wel geregistreerd maar nergens naartoe gelinkt — alle lezen
  // loopt via de eigen, generieke app/api/media/[id]-route. Een expliciete
  // 404 in plaats van iets te implementeren voorkomt dat deze plek ooit
  // per ongeluk een tweede, ongecontroleerde leesroute wordt.
  staticHandler: async () => new Response("Not found", { status: 404 }),
});
