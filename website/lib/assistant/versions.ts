// AI Verbetercentrum (2026-07-27): vaste, handmatig te verhogen
// versiestrings — puur voor reproduceerbaarheid/analyse in het
// Verbetercentrum ("waarom is dit antwoord veranderd na een update?").
// Bewust GEEN automatische hashing van answer.ts/similarity-search.ts:
// verhoog deze constante zelf wanneer de systeemprompt of het
// retrieval-algoritme materieel verandert. Nooit importeren in answer.ts of
// similarity-search.ts zelf — dat zou die bestanden onnodig aan dit
// analytics-detail koppelen.
export const ANSWER_PROMPT_VERSION = "v1";
export const RETRIEVAL_VERSION = "v1";
