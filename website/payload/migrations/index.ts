import * as migration_20260721_135820_initial from "./20260721_135820_initial";
import * as migration_20260722_083119_add_answer_feedback from "./20260722_083119_add_answer_feedback";
import * as migration_20260722_122452_add_gmail_connection from "./20260722_122452_add_gmail_connection";

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
];
