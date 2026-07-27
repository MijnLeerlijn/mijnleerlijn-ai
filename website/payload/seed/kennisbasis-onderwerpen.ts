import { getPayload, type Payload } from "payload";
import config from "../../payload.config";

// De 2 kennisbasis-onderwerpen die nodig zijn om de intentiebepaling (fase
// 1, lib/assistant/bepaal-intentie.ts) te testen — bewust NIET méér, zie de
// toelichting bij KennisbasisOnderwerpen.ts. Idempotent (upsert op
// `onderwerp`, zelfde patroon als eval-questions.ts) en zoekt gekoppelde
// bronnen op TITEL, niet op een vast database-ID — knowledge-sources-ID's
// verschillen tussen omgevingen (lokaal/preview/productie), titels van
// bestaande, al geïmporteerde PDF's zijn de enige stabiele sleutel.
//
// Gebruik: node --env-file=.env node_modules/.bin/tsx payload/seed/kennisbasis-onderwerpen.ts

interface KennisbasisOnderwerpSeed {
  onderwerp: string;
  doel: string;
  officieleTerm: string;
  synoniemen: string[];
  voorbeeldvragen: string[];
  toelichting: string;
  gekoppeldeHandleidingTitel: string;
  verduidelijkingsvraag: string;
  prioriteit: number;
}

const VERDUIDELIJKINGSVRAAG =
  "Wil je doelen aan één leerling koppelen, of een doelenset aan meerdere leerlingen?";

const ONDERWERPEN: KennisbasisOnderwerpSeed[] = [
  {
    onderwerp: "Doelen koppelen aan één leerling",
    doel: "Een leerkracht wil handmatig één of meerdere leerdoelen toevoegen/koppelen aan één individuele leerling.",
    officieleTerm: "Handmatig leerdoelen toevoegen aan leerlingen",
    synoniemen: ["doelen", "leerdoelen", "leerling", "kind", "koppelen", "toewijzen", "toevoegen"],
    voorbeeldvragen: [
      "Hoe koppel ik een leerling aan doelen?",
      "Hoe koppel ik een leerling aan leerdoelen?",
      "Hoe voeg ik een leerdoel toe aan een leerling?",
    ],
    toelichting:
      "Gaat over het handmatig toevoegen/koppelen van leerdoelen aan één individuele leerling — niet over een vooraf samengestelde doelenset voor een hele groep tegelijk (zie 'Doelenset koppelen aan meerdere leerlingen').",
    gekoppeldeHandleidingTitel: "Handmatig leerdoelen toevoegen aan leerlingen",
    verduidelijkingsvraag: VERDUIDELIJKINGSVRAAG,
    prioriteit: 5,
  },
  {
    onderwerp: "Doelenset koppelen aan meerdere leerlingen",
    doel: "Een leerkracht wil een vooraf samengestelde doelenset in één keer koppelen aan meerdere leerlingen of een hele groep.",
    officieleTerm: "Doelenset koppelen aan leerlingen",
    synoniemen: ["doelenset", "set doelen", "groep", "klas", "doelen", "leerdoelen", "koppelen", "toewijzen"],
    voorbeeldvragen: [
      "Hoe koppel ik een doelenset aan een groep?",
      "Hoe koppel ik een doelenset aan meerdere leerlingen?",
      "Hoe wijs ik een set doelen toe aan een klas?",
    ],
    toelichting:
      "Gaat over het koppelen van een vooraf samengestelde doelenset aan meerdere leerlingen of een hele groep tegelijk — niet over het handmatig toevoegen van losse leerdoelen aan één leerling (zie 'Doelen koppelen aan één leerling').",
    gekoppeldeHandleidingTitel: "Doelenset koppelen aan leerlingen",
    verduidelijkingsvraag: VERDUIDELIJKINGSVRAAG,
    prioriteit: 5,
  },
];

async function vindGekoppeldeHandleiding(
  payload: Payload,
  titel: string
): Promise<{ relationTo: "knowledge-sources"; value: number } | null> {
  const gevonden = await payload.find({
    collection: "knowledge-sources",
    where: { title: { equals: titel } },
    limit: 1,
    overrideAccess: true,
  });
  if (!gevonden.docs[0]) return null;
  return { relationTo: "knowledge-sources", value: Number(gevonden.docs[0].id) };
}

async function run() {
  const payload = await getPayload({ config });
  console.log(`Payload geïnitialiseerd, seeden van ${ONDERWERPEN.length} kennisbasis-onderwerpen gestart…`);

  let aangemaakt = 0;
  let bijgewerkt = 0;

  for (const onderwerp of ONDERWERPEN) {
    const gekoppeldeHandleiding = await vindGekoppeldeHandleiding(payload, onderwerp.gekoppeldeHandleidingTitel);
    if (!gekoppeldeHandleiding) {
      console.warn(
        `Bron "${onderwerp.gekoppeldeHandleidingTitel}" niet gevonden in deze omgeving — "${onderwerp.onderwerp}" wordt gezaaid zonder gekoppelde handleiding. Koppel deze later handmatig in het beheer.`
      );
    }

    const data = {
      onderwerp: onderwerp.onderwerp,
      doel: onderwerp.doel,
      officieleTerm: onderwerp.officieleTerm,
      synoniemen: onderwerp.synoniemen,
      voorbeeldvragen: onderwerp.voorbeeldvragen,
      toelichting: onderwerp.toelichting,
      gekoppeldeHandleidingen: gekoppeldeHandleiding ? [gekoppeldeHandleiding] : [],
      verduidelijkingsvraag: onderwerp.verduidelijkingsvraag,
      prioriteit: onderwerp.prioriteit,
      status: "gepubliceerd" as const,
    };

    const bestaande = await payload.find({
      collection: "kennisbasis-onderwerpen",
      where: { onderwerp: { equals: onderwerp.onderwerp } },
      limit: 1,
      overrideAccess: true,
    });

    if (bestaande.docs[0]) {
      await payload.update({
        collection: "kennisbasis-onderwerpen",
        id: bestaande.docs[0].id,
        overrideAccess: true,
        data,
      });
      bijgewerkt += 1;
    } else {
      await payload.create({
        collection: "kennisbasis-onderwerpen",
        overrideAccess: true,
        data,
      });
      aangemaakt += 1;
    }
  }

  console.log(`\nSeed voltooid: ${aangemaakt} nieuw, ${bijgewerkt} bijgewerkt (totaal ${ONDERWERPEN.length}).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Seeden van kennisbasis-onderwerpen mislukt:", error);
  process.exit(1);
});
