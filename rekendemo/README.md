# Rekenmateriaal-demo (Aruba en Curaçao)

Demo-webapp waarmee een leerkracht een rekendoel invoert en daar lokaal passend
rekenmateriaal bij laat maken. Deze applicatie staat los van de andere
MijnLeerlijn-projecten in deze repository.

**Wat er nu staat:**

- **Fase 1** — het invoerscherm: eiland, taal, rekendoel, leerjaar, type opgaven,
  aantal opgaven, tekenwens en antwoordenblad.
- **Fase 2** — echte generatie van rekenopgaven via de OpenAI API, met lokale
  kennisprofielen per eiland, gestructureerde JSON-output, een validatielaag en
  een preview van het werkblad.
- **Fase 2.5** — eenvoudige berekeningen worden automatisch nagerekend (zonder
  `eval`), het antwoord wordt vergeleken waar dat ondubbelzinnig kan, en er zijn
  unit tests voor die controle.

Nog niet aanwezig: tekeningen, PDF, opslag, accounts.

## Lokaal starten

```bash
cd rekendemo
npm install
cp .env.example .env.local   # vul OPENAI_API_KEY in
npm run dev
```

Open daarna http://localhost:3000.

## Omgevingsvariabelen

| Variabele | Verplicht | Toelichting |
| --- | --- | --- |
| `OPENAI_API_KEY` | ja | API-sleutel van OpenAI. Wordt alleen server-side gebruikt. |
| `OPENAI_MODEL` | nee | Leeg of afwezig = `gpt-5`. Bijvoorbeeld `gpt-5-mini` voor sneller en goedkoper. |
| `OPENAI_BASE_URL` | nee | Alternatief endpoint, bijvoorbeeld een lokale testserver. |
| `AI_PROVIDER` | nee | Op dit moment alleen `openai`. |

Zet dezelfde variabelen in Vercel onder Project Settings → Environment Variables.
Committeer nooit een echte sleutel; `.env*.local` staat in `.gitignore`.

## Overige scripts

```bash
npm run build      # productiebuild
npm run start      # productiebuild draaien
npm run typecheck  # TypeScript controleren
npm run lint       # ESLint
npm run test       # unit tests (vitest)
```

## Structuur

```
app/                        App Router: layout, globals.css, scherm "Werkblad maken"
app/api/generate/route.ts   Server-side generatie-endpoint
components/                 WerkbladFormulier en WerkbladPreview
components/ui/              Herbruikbare formulierelementen
lib/werkblad.ts             Formuliermodel, opties, taallogica en invoercontrole
lib/resultaat.ts            Type van het gegenereerde werkblad
lib/locales/                Lokale kennisprofielen (aruba.ts, curacao.ts, gedeeld.ts)
lib/ai/                     Prompt, JSON-schema, providerlaag en generator
lib/validatie/              Vormcontrole, didactische/lokale regels en de rekencontrole
lib/client/                 Aanroep van /api/generate vanuit de browser
```

De lagen staan bewust los van elkaar: het kennisprofiel weet niets van de AI-provider,
de provider niets van de eilanden, en de validatie draait op het resultaat zonder de
prompt te kennen. Een ander model instellen, een eiland toevoegen of een regel
aanscherpen kan daardoor per laag.

## Deployment

Standaard Next.js App Router-project zonder externe diensten of
omgevingsvariabelen; te deployen op Vercel met de root directory `rekendemo`.
