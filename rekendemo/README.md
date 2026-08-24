# Rekenmateriaal-demo (Aruba en Curaçao)

Demo-webapp waarmee een leerkracht een rekendoel invoert en daar lokaal passend
rekenmateriaal bij laat maken. Deze applicatie staat los van de andere
MijnLeerlijn-projecten in deze repository.

**Fase 1 (dit is wat er nu staat):** de basis van de app en het invoerscherm,
met een preview van de gemaakte keuzes. Er wordt nog niets gegenereerd — geen
AI, geen tekeningen, geen PDF.

## Lokaal starten

```bash
cd rekendemo
npm install
npm run dev
```

Open daarna http://localhost:3000.

## Overige scripts

```bash
npm run build      # productiebuild
npm run start      # productiebuild draaien
npm run typecheck  # TypeScript controleren
npm run lint       # ESLint
```

## Structuur

```
app/                 App Router: layout, globals.css en het scherm "Werkblad maken"
components/          WerkbladFormulier en WerkbladPreview
components/ui/       Herbruikbare formulierelementen (kaarten, segmenten, toggle, knop)
lib/werkblad.ts      Datamodel, opties, standaardwaarden en taallogica per eiland
```

## Deployment

Standaard Next.js App Router-project zonder externe diensten of
omgevingsvariabelen; te deployen op Vercel met de root directory `rekendemo`.
