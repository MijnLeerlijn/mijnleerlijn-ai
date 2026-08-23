import { describe, it, expect } from "vitest";
import { classificeerEmbeddingFout } from "./ai-client";
import {
  APICallError,
  LoadAPIKeyError,
  LoadSettingError,
  NoSuchModelError,
  TooManyEmbeddingValuesForCallError,
  JSONParseError,
  NoContentGeneratedError,
} from "ai";

// Productiecontrole vervolgronde (2026-08-23) — dekt uitsluitend de veilige
// classificatie: een pure functie, geen echte OpenAI-aanroep nodig (dus ook
// geen OPENAI_API_KEY vereist in de testomgeving). Elke case gebruikt een
// ECHTE instantie van de @ai-sdk/provider-foutklasse (via "ai" geëxporteerd)
// i.p.v. een nagebootste vorm — zodat een toekomstige SDK-wijziging in de
// klassenhiërarchie hier daadwerkelijk zou opvallen.

function apiCallError(statusCode?: number) {
  return new APICallError({ message: "fout", url: "https://api.openai.com/v1/embeddings", requestBodyValues: {}, statusCode });
}

describe("classificeerEmbeddingFout — veilige categorie/stap/HTTP-status/modelnaam, nooit de rauwe message", () => {
  it("herkent een ontbrekende OPENAI_API_KEY aan de exacte requireEnv-boodschap", () => {
    const fout = new Error("Ontbrekende verplichte omgevingsvariabele: OPENAI_API_KEY. Zie .env.example en docs/IMPLEMENTATION-PLAN.md Fase 4.");
    expect(classificeerEmbeddingFout(fout, "text-embedding-3-small")).toEqual({
      categorie: "openai_api_key_ontbreekt",
      stap: "api_key",
      httpStatus: null,
      model: "text-embedding-3-small",
    });
  });

  it("een andersoortige Error met 'Ontbrekende' elders in de tekst wordt NIET als api-key-fout herkend (exacte prefix-match)", () => {
    const fout = new Error("Er ontbreekt iets, maar dit is geen env-var-boodschap.");
    expect(classificeerEmbeddingFout(fout, "m").categorie).not.toBe("openai_api_key_ontbreekt");
  });

  it("LoadAPIKeyError -> openai_api_key_ongeldig", () => {
    const fout = new LoadAPIKeyError({ message: "Invalid API key" });
    expect(classificeerEmbeddingFout(fout, "m")).toMatchObject({ categorie: "openai_api_key_ongeldig", stap: "api_key", httpStatus: null });
  });

  it("LoadSettingError -> openai_instelling_ongeldig", () => {
    const fout = new LoadSettingError({ message: "bad setting" });
    expect(classificeerEmbeddingFout(fout, "m")).toMatchObject({ categorie: "openai_instelling_ongeldig", stap: "api_key" });
  });

  it.each([
    [401, "openai_authenticatie_geweigerd"],
    [403, "openai_authenticatie_geweigerd"],
    [404, "openai_model_niet_gevonden"],
    [429, "openai_rate_limited"],
    [500, "openai_server_fout"],
    [503, "openai_server_fout"],
    [400, "openai_verzoek_ongeldig"],
    [422, "openai_verzoek_ongeldig"],
  ] as const)("APICallError met status %i -> %s, HTTP-status wordt meegegeven", (statusCode, categorie) => {
    const diagnose = classificeerEmbeddingFout(apiCallError(statusCode), "text-embedding-3-small");
    expect(diagnose).toEqual({ categorie, stap: "aanroep", httpStatus: statusCode, model: "text-embedding-3-small" });
  });

  it("APICallError zonder statusCode valt terug op een generieke categorie, httpStatus blijft null", () => {
    const diagnose = classificeerEmbeddingFout(apiCallError(undefined), "m");
    expect(diagnose).toEqual({ categorie: "openai_api_fout", stap: "aanroep", httpStatus: null, model: "m" });
  });

  it("NoSuchModelError -> embedding_model_onbekend", () => {
    const fout = new NoSuchModelError({ modelId: "onbestaand-model", modelType: "embeddingModel" });
    expect(classificeerEmbeddingFout(fout, "onbestaand-model")).toMatchObject({ categorie: "embedding_model_onbekend", stap: "aanroep" });
  });

  it("TooManyEmbeddingValuesForCallError -> te_veel_embedding_waarden_in_aanroep", () => {
    const fout = new TooManyEmbeddingValuesForCallError({ provider: "openai", modelId: "m", maxEmbeddingsPerCall: 1, values: [1, 2] });
    expect(classificeerEmbeddingFout(fout, "m")).toMatchObject({ categorie: "te_veel_embedding_waarden_in_aanroep", stap: "aanroep" });
  });

  it("JSONParseError (onverwachte respons) -> onverwachte_respons_van_provider, stap 'respons'", () => {
    const fout = new JSONParseError({ text: "{niet geldig", cause: new Error("x") });
    expect(classificeerEmbeddingFout(fout, "m")).toMatchObject({ categorie: "onverwachte_respons_van_provider", stap: "respons" });
  });

  it("een andere, niet apart afgehandelde AISDKError-subklasse -> ai_sdk_fout_overig", () => {
    const fout = new NoContentGeneratedError();
    expect(classificeerEmbeddingFout(fout, "m")).toMatchObject({ categorie: "ai_sdk_fout_overig", stap: "onbekend" });
  });

  it("een volledig onbekende/generieke fout -> onbekende_fout, nooit de eigen message in het resultaat", () => {
    const fout = new Error("connect ETIMEDOUT 10.0.0.1:443");
    const diagnose = classificeerEmbeddingFout(fout, "m");
    expect(diagnose).toEqual({ categorie: "onbekende_fout", stap: "onbekend", httpStatus: null, model: "m" });
    expect(JSON.stringify(diagnose)).not.toContain("ETIMEDOUT");
  });

  it("geeft altijd exact de meegegeven modelnaam terug, nooit iets uit de fout zelf gehaald", () => {
    expect(classificeerEmbeddingFout(new Error("x"), "mijn-model-id").model).toBe("mijn-model-id");
  });
});
