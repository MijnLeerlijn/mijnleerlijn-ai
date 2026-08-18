import * as migration_20260721_135820_initial from './20260721_135820_initial';
import * as migration_20260722_083119_add_answer_feedback from './20260722_083119_add_answer_feedback';
import * as migration_20260722_122452_add_gmail_connection from './20260722_122452_add_gmail_connection';
import * as migration_20260722_220528_add_support_threads from './20260722_220528_add_support_threads';
import * as migration_20260723_113031_add_knowledge_drafts from './20260723_113031_add_knowledge_drafts';
import * as migration_20260723_141018_add_knowledge_sources from './20260723_141018_add_knowledge_sources';
import * as migration_20260723_154646_add_embeddings from './20260723_154646_add_embeddings';
import * as migration_20260723_163206_add_assistant_conversations from './20260723_163206_add_assistant_conversations';
import * as migration_20260723_171526_add_manual_sync_fields from './20260723_171526_add_manual_sync_fields';
import * as migration_20260724_122940_add_knowledge_source_priority from './20260724_122940_add_knowledge_source_priority';
import * as migration_20260725_121240_add_assistant_eval_and_source_purpose from './20260725_121240_add_assistant_eval_and_source_purpose';
import * as migration_20260725_203557_helpdesk_mvp_manual_visibility from './20260725_203557_helpdesk_mvp_manual_visibility';
import * as migration_20260726_084003_handleidingen_en_voorbeeldvragen from './20260726_084003_handleidingen_en_voorbeeldvragen';
import * as migration_20260726_085845_assistant_conversations_steps from './20260726_085845_assistant_conversations_steps';
import * as migration_20260727_055935_download_beheer from './20260727_055935_download_beheer';
import * as migration_20260727_084413_kennisbasis_onderwerpen from './20260727_084413_kennisbasis_onderwerpen';
import * as migration_20260727_124555_verbetercentrum_velden from './20260727_124555_verbetercentrum_velden';
import * as migration_20260728_095922_kennisbasis_mijnleerlijn_global from './20260728_095922_kennisbasis_mijnleerlijn_global';
import * as migration_20260728_134927_verbetercentrum_kennisbasis_velden from './20260728_134927_verbetercentrum_kennisbasis_velden';
import * as migration_20260729_120000_helpdesk_vragen from './20260729_120000_helpdesk_vragen';
import * as migration_20260729_150000_categorie_kleuren_uitbreiden from './20260729_150000_categorie_kleuren_uitbreiden';
import * as migration_20260730_120000_multibrand_variants from './20260730_120000_multibrand_variants';
import * as migration_20260811_080000_helpdesk_instellingen from './20260811_080000_helpdesk_instellingen';
import * as migration_20260813_090000_creator_v1_datamodel from './20260813_090000_creator_v1_datamodel';
import * as migration_20260813_150000_mail_templates from './20260813_150000_mail_templates';
import * as migration_20260814_090000_sales_v1_datamodel from './20260814_090000_sales_v1_datamodel';
import * as migration_20260814_102738_sales_v2_ux_velden from './20260814_102738_sales_v2_ux_velden';
import * as migration_20260815_090000_sales_relatie_analyse_veld from './20260815_090000_sales_relatie_analyse_veld';
import * as migration_20260815_120000_sales_proposal_superseded from './20260815_120000_sales_proposal_superseded';
import * as migration_20260816_090000_sales_sync_status from './20260816_090000_sales_sync_status';
import * as migration_20260816_150000_sales_board_reconciliation from './20260816_150000_sales_board_reconciliation';
import * as migration_20260817_090000_personal_tasks from './20260817_090000_personal_tasks';
import * as migration_20260817_130000_google_connections from './20260817_130000_google_connections';
import * as migration_20260817_150000_voorbereiding_signalen from './20260817_150000_voorbereiding_signalen';
import * as migration_20260817_170000_mail_signalen from './20260817_170000_mail_signalen';
import * as migration_20260818_090000_mail_signalen_categorie from './20260818_090000_mail_signalen_categorie';
import * as migration_20260819_100000_trainer_accounts_v1 from './20260819_100000_trainer_accounts_v1';
import * as migration_20260819_110000_trainer_accounts_system_rels_fix from './20260819_110000_trainer_accounts_system_rels_fix';
import * as migration_20260819_120000_trainer_log_events_v1 from './20260819_120000_trainer_log_events_v1';

export const migrations = [
  {
    up: migration_20260721_135820_initial.up,
    down: migration_20260721_135820_initial.down,
    name: '20260721_135820_initial',
  },
  {
    up: migration_20260722_083119_add_answer_feedback.up,
    down: migration_20260722_083119_add_answer_feedback.down,
    name: '20260722_083119_add_answer_feedback',
  },
  {
    up: migration_20260722_122452_add_gmail_connection.up,
    down: migration_20260722_122452_add_gmail_connection.down,
    name: '20260722_122452_add_gmail_connection',
  },
  {
    up: migration_20260722_220528_add_support_threads.up,
    down: migration_20260722_220528_add_support_threads.down,
    name: '20260722_220528_add_support_threads',
  },
  {
    up: migration_20260723_113031_add_knowledge_drafts.up,
    down: migration_20260723_113031_add_knowledge_drafts.down,
    name: '20260723_113031_add_knowledge_drafts',
  },
  {
    up: migration_20260723_141018_add_knowledge_sources.up,
    down: migration_20260723_141018_add_knowledge_sources.down,
    name: '20260723_141018_add_knowledge_sources',
  },
  {
    up: migration_20260723_154646_add_embeddings.up,
    down: migration_20260723_154646_add_embeddings.down,
    name: '20260723_154646_add_embeddings',
  },
  {
    up: migration_20260723_163206_add_assistant_conversations.up,
    down: migration_20260723_163206_add_assistant_conversations.down,
    name: '20260723_163206_add_assistant_conversations',
  },
  {
    up: migration_20260723_171526_add_manual_sync_fields.up,
    down: migration_20260723_171526_add_manual_sync_fields.down,
    name: '20260723_171526_add_manual_sync_fields',
  },
  {
    up: migration_20260724_122940_add_knowledge_source_priority.up,
    down: migration_20260724_122940_add_knowledge_source_priority.down,
    name: '20260724_122940_add_knowledge_source_priority',
  },
  {
    up: migration_20260725_121240_add_assistant_eval_and_source_purpose.up,
    down: migration_20260725_121240_add_assistant_eval_and_source_purpose.down,
    name: '20260725_121240_add_assistant_eval_and_source_purpose',
  },
  {
    up: migration_20260725_203557_helpdesk_mvp_manual_visibility.up,
    down: migration_20260725_203557_helpdesk_mvp_manual_visibility.down,
    name: '20260725_203557_helpdesk_mvp_manual_visibility',
  },
  {
    up: migration_20260726_084003_handleidingen_en_voorbeeldvragen.up,
    down: migration_20260726_084003_handleidingen_en_voorbeeldvragen.down,
    name: '20260726_084003_handleidingen_en_voorbeeldvragen',
  },
  {
    up: migration_20260726_085845_assistant_conversations_steps.up,
    down: migration_20260726_085845_assistant_conversations_steps.down,
    name: '20260726_085845_assistant_conversations_steps',
  },
  {
    up: migration_20260727_055935_download_beheer.up,
    down: migration_20260727_055935_download_beheer.down,
    name: '20260727_055935_download_beheer',
  },
  {
    up: migration_20260727_084413_kennisbasis_onderwerpen.up,
    down: migration_20260727_084413_kennisbasis_onderwerpen.down,
    name: '20260727_084413_kennisbasis_onderwerpen',
  },
  {
    up: migration_20260727_124555_verbetercentrum_velden.up,
    down: migration_20260727_124555_verbetercentrum_velden.down,
    name: '20260727_124555_verbetercentrum_velden',
  },
  {
    up: migration_20260728_095922_kennisbasis_mijnleerlijn_global.up,
    down: migration_20260728_095922_kennisbasis_mijnleerlijn_global.down,
    name: '20260728_095922_kennisbasis_mijnleerlijn_global',
  },
  {
    up: migration_20260728_134927_verbetercentrum_kennisbasis_velden.up,
    down: migration_20260728_134927_verbetercentrum_kennisbasis_velden.down,
    name: '20260728_134927_verbetercentrum_kennisbasis_velden'
  },
  {
    up: migration_20260729_120000_helpdesk_vragen.up,
    down: migration_20260729_120000_helpdesk_vragen.down,
    name: '20260729_120000_helpdesk_vragen',
  },
  {
    up: migration_20260729_150000_categorie_kleuren_uitbreiden.up,
    down: migration_20260729_150000_categorie_kleuren_uitbreiden.down,
    name: '20260729_150000_categorie_kleuren_uitbreiden',
  },
  {
    up: migration_20260730_120000_multibrand_variants.up,
    down: migration_20260730_120000_multibrand_variants.down,
    name: '20260730_120000_multibrand_variants',
  },
  {
    up: migration_20260811_080000_helpdesk_instellingen.up,
    down: migration_20260811_080000_helpdesk_instellingen.down,
    name: '20260811_080000_helpdesk_instellingen',
  },
  {
    up: migration_20260813_090000_creator_v1_datamodel.up,
    down: migration_20260813_090000_creator_v1_datamodel.down,
    name: '20260813_090000_creator_v1_datamodel',
  },
  {
    up: migration_20260813_150000_mail_templates.up,
    down: migration_20260813_150000_mail_templates.down,
    name: '20260813_150000_mail_templates',
  },
  {
    up: migration_20260814_090000_sales_v1_datamodel.up,
    down: migration_20260814_090000_sales_v1_datamodel.down,
    name: '20260814_090000_sales_v1_datamodel',
  },
  {
    up: migration_20260814_102738_sales_v2_ux_velden.up,
    down: migration_20260814_102738_sales_v2_ux_velden.down,
    name: '20260814_102738_sales_v2_ux_velden',
  },
  {
    up: migration_20260815_090000_sales_relatie_analyse_veld.up,
    down: migration_20260815_090000_sales_relatie_analyse_veld.down,
    name: '20260815_090000_sales_relatie_analyse_veld',
  },
  {
    up: migration_20260815_120000_sales_proposal_superseded.up,
    down: migration_20260815_120000_sales_proposal_superseded.down,
    name: '20260815_120000_sales_proposal_superseded',
  },
  {
    up: migration_20260816_090000_sales_sync_status.up,
    down: migration_20260816_090000_sales_sync_status.down,
    name: '20260816_090000_sales_sync_status',
  },
  {
    up: migration_20260816_150000_sales_board_reconciliation.up,
    down: migration_20260816_150000_sales_board_reconciliation.down,
    name: '20260816_150000_sales_board_reconciliation',
  },
  {
    up: migration_20260817_090000_personal_tasks.up,
    down: migration_20260817_090000_personal_tasks.down,
    name: '20260817_090000_personal_tasks',
  },
  {
    up: migration_20260817_130000_google_connections.up,
    down: migration_20260817_130000_google_connections.down,
    name: '20260817_130000_google_connections',
  },
  {
    up: migration_20260817_150000_voorbereiding_signalen.up,
    down: migration_20260817_150000_voorbereiding_signalen.down,
    name: '20260817_150000_voorbereiding_signalen',
  },
  {
    up: migration_20260817_170000_mail_signalen.up,
    down: migration_20260817_170000_mail_signalen.down,
    name: '20260817_170000_mail_signalen',
  },
  {
    up: migration_20260818_090000_mail_signalen_categorie.up,
    down: migration_20260818_090000_mail_signalen_categorie.down,
    name: '20260818_090000_mail_signalen_categorie',
  },
  {
    up: migration_20260819_100000_trainer_accounts_v1.up,
    down: migration_20260819_100000_trainer_accounts_v1.down,
    name: '20260819_100000_trainer_accounts_v1',
  },
  {
    up: migration_20260819_110000_trainer_accounts_system_rels_fix.up,
    down: migration_20260819_110000_trainer_accounts_system_rels_fix.down,
    name: '20260819_110000_trainer_accounts_system_rels_fix',
  },
  {
    up: migration_20260819_120000_trainer_log_events_v1.up,
    down: migration_20260819_120000_trainer_log_events_v1.down,
    name: '20260819_120000_trainer_log_events_v1',
  },
];
