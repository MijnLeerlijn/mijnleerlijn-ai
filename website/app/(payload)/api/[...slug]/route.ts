import config from "@/payload.config";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";

// Payload's REST API — alleen bereikbaar voor de eigen admin-UI en, waar
// bewust toegestaan, publieke reads (zie access-functies in payload/access/
// roles.ts). Publieke pagina's praten hier NIET rechtstreeks mee — die gaan
// altijd via services/payload.ts (local API), zie docs/PLATFORM-FOUNDATION.md §9.
export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
