import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Live regressie-vervolgronde (2026-08-27/28, spec "*/# doen nog steeds niets
// tijdens actieve opname, ook ná dispatch op oproep.status") — root cause:
// call.gather.ended bleek live niet (voldoende) betrouwbaar tijdens een
// actieve parallelle gather; call.dtmf.received wordt nu de primaire trigger
// voor verwerkOpnameToets (call.gather.ended blijft fallback). Omdat Telnyx
// voor DEZELFDE fysieke toetsdruk soms BEIDE events aflevert, is een
// atomaire dedup-claim nodig (spec-eis: "geen dedupe uitsluitend in memory,
// dit draait serverless"). Sleutel is de client_state van de opname_toets-
// gather zelf (telnyx-provider.ts), NIET heropname_pogingen — zie
// oproep-state.ts se claimOpnameToetsVerwerking voor de volledige
// redenering waarom dat laatste niet volstaat.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "opname_toets_claim_client_state" varchar;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "opname_toets_claim_client_state";`);
}
