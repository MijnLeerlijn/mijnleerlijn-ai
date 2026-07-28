// AI Verbetercentrum (2026-07-27): vaste, handmatig te verhogen
// versiestrings — puur voor reproduceerbaarheid/analyse in het
// Verbetercentrum ("waarom is dit antwoord veranderd na een update?").
// Bewust GEEN automatische hashing van answer.ts/similarity-search.ts:
// verhoog deze constante zelf wanneer de systeemprompt of het
// retrieval-algoritme materieel verandert. Nooit importeren in answer.ts of
// similarity-search.ts zelf — dat zou die bestanden onnodig aan dit
// analytics-detail koppelen.
// v2 (2026-07-28, Fase 4): systeemprompt kreeg de regels 13-14 voor het
// centrale Kennisbasis MijnLeerlijn-blok (visie/betekenis, term nooit
// overschrijven, tegenstrijdigheid-rapportage) en het antwoordschema het
// nieuwe veld "tegenstrijdigheid".
export const ANSWER_PROMPT_VERSION = "v2";
// v2 (2026-07-28, Fase 4): searchKnowledgePhased sluit bronnen met bronrol
// "background-model" nu uit (die rol wordt vervuld door de gegarandeerde
// centrale-kennisbasis-Global, niet meer door reguliere retrieval).
export const RETRIEVAL_VERSION = "v2";
