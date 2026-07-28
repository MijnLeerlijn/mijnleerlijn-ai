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
    name: '20260728_095922_kennisbasis_mijnleerlijn_global'
  },
];
