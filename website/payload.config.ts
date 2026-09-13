import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { cloudStoragePlugin } from "@payloadcms/plugin-cloud-storage";
import sharp from "sharp";

import { isProduction, optionalEnv, requireEnv, getTrainersOrigin } from "@/config/env";
import { privateBlobAdapter } from "@/lib/media/private-blob-adapter";
import { Users } from "./payload/collections/Users";
import { TrainerAccounts } from "./payload/collections/TrainerAccounts";
import { TrainerLogEvents } from "./payload/collections/TrainerLogEvents";
import { TrainerAiLogEvents } from "./payload/collections/TrainerAiLogEvents";
import { TrainingVerslagen } from "./payload/collections/TrainingVerslagen";
import { AanvullendeTrainingen } from "./payload/collections/AanvullendeTrainingen";
import { StartActies } from "./payload/collections/StartActies";
import { TrainerTelefonieOproepen } from "./payload/collections/TrainerTelefonieOproepen";
import { TrainerLogboekItems } from "./payload/collections/TrainerLogboekItems";
import { TrainerKennisversies } from "./payload/collections/TrainerKennisversies";
import { TrainerKennisvragen } from "./payload/collections/TrainerKennisvragen";
import { TrainerDeelgroepen } from "./payload/collections/TrainerDeelgroepen";
import { TrainerBestanden } from "./payload/collections/TrainerBestanden";
import { Variants } from "./payload/collections/Variants";
import { Categories } from "./payload/collections/Categories";
import { Articles } from "./payload/collections/Articles";
import { VariantOverrides } from "./payload/collections/VariantOverrides";
import { Sources } from "./payload/collections/Sources";
import { Media } from "./payload/collections/Media";
import { Updates } from "./payload/collections/Updates";
import { ContactSubmissions } from "./payload/collections/ContactSubmissions";
import { AnswerFeedback } from "./payload/collections/AnswerFeedback";
import { SupportThreads } from "./payload/collections/SupportThreads";
import { KnowledgeDrafts } from "./payload/collections/KnowledgeDrafts";
import { KnowledgeSources } from "./payload/collections/KnowledgeSources";
import { Handleidingen } from "./payload/collections/Handleidingen";
import { KennisbasisOnderwerpen } from "./payload/collections/KennisbasisOnderwerpen";
import { HelpdeskVragen } from "./payload/collections/HelpdeskVragen";
import { AssistantConversations } from "./payload/collections/AssistantConversations";
import { GedeeldeChats } from "./payload/collections/GedeeldeChats";
import { AssistantEvalQuestions } from "./payload/collections/AssistantEvalQuestions";
import { AssistantEvalRuns } from "./payload/collections/AssistantEvalRuns";
import { MailDrafts } from "./payload/collections/MailDrafts";
import { MailTemplates } from "./payload/collections/MailTemplates";
import { DerivedContent } from "./payload/collections/DerivedContent";
import { SalesSchools } from "./payload/collections/SalesSchools";
import { SalesLogEvents } from "./payload/collections/SalesLogEvents";
import { SalesActions } from "./payload/collections/SalesActions";
import { SalesProposals } from "./payload/collections/SalesProposals";
import { PersonalTasks } from "./payload/collections/PersonalTasks";
import { GoogleConnections } from "./payload/collections/GoogleConnections";
import { VoorbereidingSignalen } from "./payload/collections/VoorbereidingSignalen";
import { MailSignalen } from "./payload/collections/MailSignalen";
import { GmailConnection } from "./payload/globals/GmailConnection";
import { KnowledgeSearch } from "./payload/globals/KnowledgeSearch";
import { AssistantEval } from "./payload/globals/AssistantEval";
import { KennisbasisMijnleerlijn } from "./payload/globals/KennisbasisMijnleerlijn";
import { HelpdeskInstellingen } from "./payload/globals/HelpdeskInstellingen";
import { SalesInstellingen } from "./payload/globals/SalesInstellingen";

const dirname = path.dirname(fileURLToPath(import.meta.url));

if (!optionalEnv("NEXT_PUBLIC_SERVER_URL")) {
  console.warn("[payload.config] NEXT_PUBLIC_SERVER_URL niet gezet — serverURL valt terug op http://localhost:3000, wat Payload's csrf-allowlist verkeerd vult. Eigen POST-routes die payload.auth() gebruiken (bv. app/api/gmail/sync) kunnen dan een echt ingelogde beheerder ten onrechte afwijzen. Zet deze variabele in productie op de exacte, echte URL (protocol + host, geen trailing slash).");
}

export default buildConfig({
  serverURL: optionalEnv("NEXT_PUBLIC_SERVER_URL") ?? "http://localhost:3000",
  csrf: [getTrainersOrigin()],
  secret: requireEnv("PAYLOAD_SECRET"),
  debug: !isProduction(),
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname, "app", "(payload)", "admin") },
    meta: { titleSuffix: " — MijnLeerlijn Beheer" },
    components: {
      afterNavLinks: ["@/payload/components/BeheerNavLinks#BeheerNavLinks"],
      header: ["@/payload/components/BeheerTopBar#BeheerTopBar"],
      views: {
        dashboard: { Component: "@/payload/components/BeheerDashboard#BeheerDashboard" },
        login: { Component: "@/payload/components/BeheerLoginView#BeheerLoginView" },
        downloadbeheer: { Component: "@/payload/components/AdminViewShell#DownloadbeheerViewShell", path: "/download-beheer" },
        downloadcategorieen: { Component: "@/payload/components/AdminViewShell#DownloadcategorieenViewShell", path: "/download-categorieen" },
        verbetercentrum: { Component: "@/payload/components/AdminViewShell#VerbetercentrumViewShell", path: "/verbetercentrum" },
        helpdeskVragen: { Component: "@/payload/components/AdminViewShell#HelpdeskVragenViewShell", path: "/helpdesk-vragen" },
        varianten: { Component: "@/payload/components/AdminViewShell#VariantenViewShell", path: "/varianten" },
        kennisbasis: { Component: "@/payload/components/AdminViewShell#KennisbasisViewShell", path: "/kennisbasis" },
        curriculumWerkplaats: { Component: "@/payload/components/AdminViewShell#CurriculumWerkplaatsViewShell", path: "/curriculum-werkplaats" },
        creator: { Component: "@/payload/components/AdminViewShell#CreatorViewShell", path: "/creator" },
        salesVandaag: { Component: "@/payload/components/AdminViewShell#SalesVandaagViewShell", path: "/sales", exact: true },
        salesScholen: { Component: "@/payload/components/AdminViewShell#SalesScholenViewShell", path: "/sales/scholen", exact: true },
        salesSchooldetail: { Component: "@/payload/components/AdminViewShell#SalesSchooldetailViewShell", path: "/sales/school", exact: true },
        salesActies: { Component: "@/payload/components/AdminViewShell#SalesActiesViewShell", path: "/sales/acties", exact: true },
        salesMondayDiagnose: { Component: "@/payload/components/AdminViewShell#SalesMondayDiagnoseViewShell", path: "/sales/monday-diagnose", exact: true },
        trainersMondayDiagnose: { Component: "@/payload/components/AdminViewShell#TrainersMondayDiagnoseViewShell", path: "/trainers-diagnose/monday", exact: true },
        trainersOverzicht: { Component: "@/payload/components/AdminViewShell#TrainersOverzichtViewShell", path: "/trainers", exact: true },
        trainersDetail: { Component: "@/payload/components/AdminViewShell#TrainerDetailViewShell", path: "/trainers/detail", exact: true },
        trainersTrainingen: { Component: "@/payload/components/AdminViewShell#TrainersTrainingenViewShell", path: "/trainers/trainingen", exact: true },
        trainersTodo: { Component: "@/payload/components/AdminViewShell#TrainersTodoViewShell", path: "/trainers/todo", exact: true },
        trainersActiviteit: { Component: "@/payload/components/AdminViewShell#TrainersActiviteitViewShell", path: "/trainers/activiteit", exact: true },
        trainersSchool: { Component: "@/payload/components/AdminViewShell#SchoolDetailViewShell", path: "/trainers/school", exact: true },
        trainersUpsell: { Component: "@/payload/components/AdminViewShell#TrainersUpsellViewShell", path: "/trainers/upsell", exact: true },
        trainersStartbegeleiding: { Component: "@/payload/components/AdminViewShell#TrainersStartbegeleidingViewShell", path: "/trainers/startbegeleiding", exact: true },
        trainersStartbegeleidingSchool: { Component: "@/payload/components/AdminViewShell#TrainersStartbegeleidingSchoolViewShell", path: "/trainers/startbegeleiding/school", exact: true },
      },
    },
  },
  collections: [Users, TrainerAccounts, TrainerLogEvents, TrainerAiLogEvents, TrainingVerslagen, AanvullendeTrainingen, StartActies, TrainerTelefonieOproepen, TrainerLogboekItems, TrainerKennisversies, TrainerKennisvragen, TrainerDeelgroepen, TrainerBestanden, Variants, Categories, Articles, VariantOverrides, Sources, Media, Updates, ContactSubmissions, AnswerFeedback, SupportThreads, KnowledgeDrafts, KnowledgeSources, Handleidingen, MailDrafts, MailTemplates, DerivedContent, KennisbasisOnderwerpen, HelpdeskVragen, AssistantConversations, GedeeldeChats, AssistantEvalQuestions, AssistantEvalRuns, SalesSchools, SalesLogEvents, SalesActions, SalesProposals, PersonalTasks, GoogleConnections, VoorbereidingSignalen, MailSignalen],
  globals: [GmailConnection, KnowledgeSearch, AssistantEval, KennisbasisMijnleerlijn, HelpdeskInstellingen, SalesInstellingen],
  editor: lexicalEditor(),
  db: postgresAdapter({ pool: { connectionString: requireEnv("DATABASE_URI") }, migrationDir: path.resolve(dirname, "payload", "migrations"), push: false }),
  typescript: { outputFile: path.resolve(dirname, "types", "payload-generated.d.ts") },
  sharp,
  plugins: [cloudStoragePlugin({ collections: { media: { adapter: privateBlobAdapter } } })],
});
