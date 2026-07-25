import { getPayload } from "payload";
import config from "../../payload.config";

// 40 representatieve MijnLeerlijn-helpdeskvragen voor de chatbot-
// evaluatieomgeving (payload/collections/AssistantEvalQuestions.ts,
// /admin/globals/assistant-eval) — GEEN fictieve Fase 3-demo-content (dat is
// payload/seed/index.ts), dit zijn bewust samengestelde, realistische
// testvragen om objectief te kunnen beoordelen of de AI-assistent echte
// helpdeskvragen correct, volledig en uitsluitend op basis van bronnen
// beantwoordt. Gebaseerd op daadwerkelijke MijnLeerlijn-functionaliteit
// (hoofdgebiedprofielen, doelensets, statussen, periodeplanner, portfolio,
// admin-rechten, analyse — zie handleidingen/ en het geïmporteerde
// achtergronddocument, payload/import-kennisbasis/), niet verzonnen.
//
// Vijf categorieën (8 vragen elk):
//   - feitelijk: heeft één concreet, kort te verifiëren antwoord.
//   - stap_voor_stap: vraagt om een concrete klik-voor-klik-procedure.
//   - meerdere_routes: er zijn aantoonbaar meerdere legitieme manieren —
//     test of de assistent ze allemaal noemt met een "waarom", i.p.v. maar
//     één te kiezen.
//   - onduidelijk: vaag/onderspecificeerd, zonder concreet aanknopingspunt
//     — test of de assistent om verduidelijking vraagt/breed antwoordt
//     i.p.v. te gokken wat bedoeld wordt.
//   - onvoldoende_bron: reële schoolvragen die de huidige kennisbank NIET
//     dekt (prijzen, koppelingen met andere systemen, specifieke technische
//     limieten) — test de harde "geen antwoord zonder bron"-regel.
//
// Idempotent: upsert op de exacte vraagtekst, zodat opnieuw draaien nooit
// duplicaten aanmaakt.
//
// Gebruik: node --env-file=.env node_modules/.bin/tsx payload/seed/eval-questions.ts

interface EvalVraag {
  question: string;
  category: "feitelijk" | "stap_voor_stap" | "meerdere_routes" | "onduidelijk" | "onvoldoende_bron";
  notes: string;
}

const VRAGEN: EvalVraag[] = [
  // --- Feitelijke vragen ---
  {
    question: "Wat betekent de kleur groen bij een leerdoel?",
    category: "feitelijk",
    notes: "Vaste statuskleur (Behaald) — eenduidig te verifiëren tegen de kennisbasis.",
  },
  {
    question: "Wat is het verschil tussen een aanbodsdoel en een cruciaal doel?",
    category: "feitelijk",
    notes: "Begrippenkader — twee gedefinieerde tags met een concreet verschil.",
  },
  {
    question: "Wat gebeurt er automatisch als ik een leerdoel op 'Behaald' zet?",
    category: "feitelijk",
    notes: "Technisch vast gedrag: doel verhuist automatisch naar het portfolio.",
  },
  {
    question: "Wat is een hoofdgebiedprofiel?",
    category: "feitelijk",
    notes: "Eenduidige definitie uit de kennisbasis.",
  },
  {
    question: "Wat is het verschil tussen 'Aanbod aanpassen' en 'Curriculum aanpassen'?",
    category: "feitelijk",
    notes: "Expliciet onderscheid dat de kennisbasis benoemt als vaak verward.",
  },
  {
    question: "Wat is de DOEL-aanpak van MijnLeerlijn?",
    category: "feitelijk",
    notes: "Vaste, benoemde begeleidingsmethodiek (Doel/Organisatie/Eigenaarschap/Leerlijnen).",
  },
  {
    question: "Wat is het verschil tussen een leerdoel en een lesdoel?",
    category: "feitelijk",
    notes: "Begrippenkader — twee helder onderscheiden termen.",
  },
  {
    question: "Wat is het verschil tussen de referentieniveaus 1F en 2F/1S?",
    category: "feitelijk",
    notes: "Begrippenkader — landelijk kader, eenduidig te beantwoorden.",
  },

  // --- Stap-voor-stapvragen ---
  {
    question: "Hoe maak ik een hoofdgebiedprofiel aan en koppel ik dit aan een leerling?",
    category: "stap_voor_stap",
    notes: "Concrete procedure met schermnamen/knoppen — hoort uit een handleiding te komen, niet verzonnen.",
  },
  {
    question: "Hoe maak ik een doelenset aan?",
    category: "stap_voor_stap",
    notes: "Directe procedurevraag, zie handleidingen/Doelenset-aanmaken.pdf.",
  },
  {
    question: "Hoe voeg ik een leerkracht toe aan een groep?",
    category: "stap_voor_stap",
    notes: "Directe procedurevraag, zie handleidingen/Leerkrachten-en-leerlingen-toevoegen-aan-een-groep.pdf.",
  },
  {
    question: "Hoe maak ik een collega admin in MijnLeerlijn?",
    category: "stap_voor_stap",
    notes: "Concrete stappen uit de kennisbasis (Leerkrachten/Leraren → schuifje adminrechten).",
  },
  {
    question: "Hoe voeg ik een tag toe aan een leerdoel?",
    category: "stap_voor_stap",
    notes: "Directe procedurevraag, zie handleidingen/Leerdoelen-tags-1.pdf.",
  },
  {
    question: "Hoe maak ik een notitie bij een leerling aan?",
    category: "stap_voor_stap",
    notes: "Directe procedurevraag, zie handleidingen/Notities-binnen-MijnLeerlijn-1.pdf.",
  },
  {
    question: "Hoe genereer ik een hoofdgebiedoverzicht?",
    category: "stap_voor_stap",
    notes: "Concrete actie die de kennisbasis letterlijk noemt als voorbeeld van een knoplabel.",
  },
  {
    question: "Hoe stel ik mijn wachtwoord opnieuw in als ik het vergeten ben?",
    category: "stap_voor_stap",
    notes: "Concrete, veelvoorkomende accountvraag — kennisbasis §15 beschrijft de route.",
  },

  // --- Vragen met meerdere routes ---
  {
    question: "Hoe koppel ik leerdoelen aan leerlingen?",
    category: "meerdere_routes",
    notes: "Kennisbasis noemt expliciet drie routes (profiel/leerjaar-periode, doelenset, handmatig) met elk een 'waarom'.",
  },
  {
    question: "Hoe start ik met een nieuw curriculum in MijnLeerlijn?",
    category: "meerdere_routes",
    notes: "Twee routes: eigen leerdoelen via Excel, of een kant-en-klaar curriculum.",
  },
  {
    question: "Hoe houd ik bij welke leerdoelen een leerling nog moet behalen?",
    category: "meerdere_routes",
    notes: "Kan via groepsoverzicht leerdoelen of groepsoverzicht statussen, afhankelijk van invalshoek.",
  },
  {
    question: "Wat is de beste manier om te werken met kleuters in MijnLeerlijn?",
    category: "meerdere_routes",
    notes: "Geen 'beste' manier — kennisbasis relativeert dit expliciet (doelensets vaak gebruikt bij kleuters, maar geen dwang).",
  },
  {
    question: "Hoe kan ik differentiëren tussen leerlingen binnen hetzelfde vak?",
    category: "meerdere_routes",
    notes: "Meerdere routes mogelijk (profielen, doelensets, handmatig koppelen) — test of alle drie genoemd worden.",
  },
  {
    question: "Hoe kan een leerling zelf zijn voortgang inzien?",
    category: "meerdere_routes",
    notes: "Portfolio/PLP kent meerdere onderdelen (Dit ben ik, PLP, chat-functie) — test volledigheid.",
  },
  {
    question: "Hoe zorg ik dat een leerling automatisch de juiste doelen krijgt per periode?",
    category: "meerdere_routes",
    notes: "Vraagt specifiek naar de 'automatisch'-route (hoofdgebiedprofiel), maar goed antwoord benoemt ook waarom de andere twee routes dat NIET doen.",
  },
  {
    question: "Wat zijn de mogelijkheden om succescriteria vast te leggen bij een leerdoel?",
    category: "meerdere_routes",
    notes: "Methode-toetsen vervangen door eigen succescriteria is één van meerdere aanpakken — test volledigheid + afweging.",
  },

  // --- Onduidelijke vragen ---
  {
    question: "Het werkt niet goed.",
    category: "onduidelijk",
    notes: "Geen enkel aanknopingspunt — test of de assistent eerlijk aangeeft onvoldoende informatie te hebben i.p.v. te gokken.",
  },
  {
    question: "Hoe pas ik dit aan?",
    category: "onduidelijk",
    notes: "'Dit' verwijst nergens naar — geen context om op te zoeken.",
  },
  {
    question: "Kun je me helpen met de doelen?",
    category: "onduidelijk",
    notes: "Te breed: curriculum, koppelen aan leerlingen, statussen en analyse gaan allemaal over 'doelen'.",
  },
  {
    question: "Waarom staat dit er niet meer?",
    category: "onduidelijk",
    notes: "Verwijst naar een niet-gespecificeerde situatie — niet te herleiden naar een bron.",
  },
  {
    question: "Hoe zet ik dit goed?",
    category: "onduidelijk",
    notes: "Geen onderwerp genoemd.",
  },
  {
    question: "Wat moet ik hier nu mee?",
    category: "onduidelijk",
    notes: "Geen onderwerp, geen scherm, geen leerdoel — volledig contextloos.",
  },
  {
    question: "Is dit de juiste manier?",
    category: "onduidelijk",
    notes: "Geen 'manier' benoemd om te beoordelen.",
  },
  {
    question: "Hoe werkt MijnLeerlijn?",
    category: "onduidelijk",
    notes: "Extreem breed — test of de assistent een zinnig, afgebakend antwoord geeft i.p.v. de hele kennisbank te dumpen.",
  },

  // --- Vragen zonder voldoende bron ---
  {
    question: "Wat kost een MijnLeerlijn-abonnement voor een school met 300 leerlingen?",
    category: "onvoldoende_bron",
    notes: "Prijsinformatie staat niet in de kennisbank — hoort door te verwijzen naar het contactformulier/de helpdesk.",
  },
  {
    question: "Kan MijnLeerlijn gekoppeld worden aan ParnasSys?",
    category: "onvoldoende_bron",
    notes: "Koppelingen met andere leerlingvolgsystemen worden nergens beschreven.",
  },
  {
    question: "Is er een MijnLeerlijn-app voor op de telefoon?",
    category: "onvoldoende_bron",
    notes: "Geen enkele bron noemt een mobiele app.",
  },
  {
    question: "Welke functionaliteit biedt MijnLeerlijn specifiek voor het voortgezet onderwijs?",
    category: "onvoldoende_bron",
    notes: "Kennisbank is doorgaans op primair onderwijs gericht — VO-specifieke claims zouden verzonnen zijn.",
  },
  {
    question: "Kan ik leerlingdata automatisch laten synchroniseren met Magister?",
    category: "onvoldoende_bron",
    notes: "Geen bron beschrijft een Magister-koppeling.",
  },
  {
    question: "Wat zijn de exacte openingstijden van de MijnLeerlijn-helpdesk?",
    category: "onvoldoende_bron",
    notes: "Kennisbasis noemt alleen 'doorgaans binnen 1 werkdag', geen openingstijden.",
  },
  {
    question: "Hoeveel opslagruimte krijgt een school standaard voor portfolio-bewijsmateriaal?",
    category: "onvoldoende_bron",
    notes: "Technische opslaglimieten staan nergens beschreven.",
  },
  {
    question: "Ondersteunt MijnLeerlijn meertalig onderwijs, bijvoorbeeld een Engelstalige leeromgeving?",
    category: "onvoldoende_bron",
    notes: "Taalondersteuning van de interface wordt in geen enkele bron behandeld.",
  },
];

async function run() {
  const payload = await getPayload({ config });
  console.log(`Payload geïnitialiseerd, seeden van ${VRAGEN.length} evaluatievragen gestart…`);

  let aangemaakt = 0;
  let bijgewerkt = 0;

  for (const vraag of VRAGEN) {
    const bestaande = await payload.find({
      collection: "assistant-eval-questions",
      where: { question: { equals: vraag.question } },
      limit: 1,
      overrideAccess: true,
    });

    if (bestaande.docs[0]) {
      await payload.update({
        collection: "assistant-eval-questions",
        id: bestaande.docs[0].id,
        overrideAccess: true,
        data: { category: vraag.category, notes: vraag.notes },
      });
      bijgewerkt += 1;
    } else {
      await payload.create({
        collection: "assistant-eval-questions",
        overrideAccess: true,
        data: vraag,
      });
      aangemaakt += 1;
    }
  }

  console.log(`\nSeed voltooid: ${aangemaakt} nieuw, ${bijgewerkt} bijgewerkt (totaal ${VRAGEN.length}).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Seeden van evaluatievragen mislukt:", error);
  process.exit(1);
});
