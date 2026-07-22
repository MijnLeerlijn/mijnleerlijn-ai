import * as migration_20260721_135820_initial from "./20260721_135820_initial";

export const migrations = [
  {
    up: migration_20260721_135820_initial.up,
    down: migration_20260721_135820_initial.down,
    name: "20260721_135820_initial",
  },
];
