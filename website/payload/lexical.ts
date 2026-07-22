// Kleine helper om platte tekst als geldige Lexical-editorstate te
// representeren — gebruikt door het seedscript (payload/seed/index.ts) en
// door tests (services/payload.test.ts), zodat beide dezelfde, geldige
// minimale AST-vorm gebruiken.
export function plainTextToLexical(text: string) {
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: [
        {
          type: "paragraph",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr" as const,
          children: [{ type: "text", format: 0, style: "", mode: "normal", detail: 0, text, version: 1 }],
        },
      ],
    },
  };
}
