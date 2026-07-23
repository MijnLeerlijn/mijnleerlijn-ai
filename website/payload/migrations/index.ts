import * as migration_20260721_135820_initial from "./20260721_135820_initial";
import * as migration_20260722_083119_add_answer_feedback from "./20260722_083119_add_answer_feedback";
import * as migration_20260722_122452_add_gmail_connection from "./20260722_122452_add_gmail_connection";
import * as migration_20260722_220528_add_support_threads from "./20260722_220528_add_support_threads";
import * as migration_20260723_113031_add_knowledge_drafts from "./20260723_113031_add_knowledge_drafts";
import * as migration_20260723_141018_add_knowledge_sources from "./20260723_141018_add_knowledge_sources";

export const migrations = [
  {
    up: migration_20260721_135820_initial.up,
    down: migration_20260721_135820_initial.down,
    name: "20260721_135820_initial",
  },
  {
    up: migration_20260722_083119_add_answer_feedback.up,
    down: migration_20260722_083119_add_answer_feedback.down,
    name: "20260722_083119_add_answer_feedback",
  },
  {
    up: migration_20260722_122452_add_gmail_connection.up,
    down: migration_20260722_122452_add_gmail_connection.down,
    name: "20260722_122452_add_gmail_connection",
  },
  {
    up: migration_20260722_220528_add_support_threads.up,
    down: migration_20260722_220528_add_support_threads.down,
    name: "20260722_220528_add_support_threads",
  },
  {
    up: migration_20260723_113031_add_knowledge_drafts.up,
    down: migration_20260723_113031_add_knowledge_drafts.down,
    name: "20260723_113031_add_knowledge_drafts",
  },
  {
    up: migration_20260723_141018_add_knowledge_sources.up,
    down: migration_20260723_141018_add_knowledge_sources.down,
    name: "20260723_141018_add_knowledge_sources",
  },
];
