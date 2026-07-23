"use client";

import { useEffect, useState } from "react";
import { useFormFields } from "@payloadcms/ui";

// Leesbaar overzicht "Onderbouwd door" op een Knowledge Draft — telt de
// gekoppelde supportthreads (sourceThreads) en groepeert de gekoppelde
// kennisbronnen (knowledgeSources) per type ("2 handleidingen", "1 video",
// enz.), zoals gevraagd. sourceThreads/knowledgeSources zelf bevatten alleen
// ID's in de formulierstatus — het type van elke kennisbron wordt met één
// lichte fetch naar de eigen Payload REST API opgehaald zodra de selectie
// verandert. Puur weergave, schrijft nergens naar.

const TYPE_LABELS: Record<string, string> = {
  pdf: "pdf's",
  video: "video's",
  website: "website's",
  release_notes: "release notes",
  handleiding: "handleidingen",
  faq: "FAQ's",
  intern_document: "interne documenten",
};

export function OnderbouwdDoorSummary() {
  const sourceThreadsValue = useFormFields(([fields]) => fields?.sourceThreads?.value) as
    (number | string)[] | undefined;
  const knowledgeSourcesValue = useFormFields(([fields]) => fields?.knowledgeSources?.value) as
    (number | string)[] | undefined;

  const knowledgeSourceIds = (knowledgeSourcesValue ?? []).map(String).join(",");
  // `opgehaald.ids` bewaakt of `opgehaald.perType` nog bij de huidige
  // knowledgeSourceIds hoort — zolang dat niet zo is (nog geen bronnen, of
  // een fetch loopt nog) tonen we {} in plaats van verouderde data. Zo hoeft
  // de effect-body zelf nooit synchroon setState aan te roepen (alleen
  // vanuit de fetch-callback), wat de react-hooks/set-state-in-effect-regel
  // vereist.
  const [opgehaald, setOpgehaald] = useState<{ ids: string; perType: Record<string, number> }>({
    ids: "",
    perType: {},
  });

  useEffect(() => {
    if (!knowledgeSourceIds) return;
    const controller = new AbortController();
    fetch(
      `/api/knowledge-sources?where[id][in]=${knowledgeSourceIds}&limit=${knowledgeSourceIds.split(",").length}&depth=0`,
      { credentials: "include", signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data: { docs?: { type: string }[] }) => {
        const telling: Record<string, number> = {};
        for (const doc of data.docs ?? []) {
          telling[doc.type] = (telling[doc.type] ?? 0) + 1;
        }
        setOpgehaald({ ids: knowledgeSourceIds, perType: telling });
      })
      .catch(() => setOpgehaald({ ids: knowledgeSourceIds, perType: {} }));
    return () => controller.abort();
  }, [knowledgeSourceIds]);

  const perType = opgehaald.ids === knowledgeSourceIds ? opgehaald.perType : {};
  const threadCount = (sourceThreadsValue ?? []).length;
  const heeftBronnen = threadCount > 0 || Object.keys(perType).length > 0;

  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Onderbouwd door</p>
      {!heeftBronnen ? (
        <p style={{ color: "var(--theme-elevation-500)" }}>Nog geen gekoppelde bronnen.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {threadCount > 0 && (
            <li>
              ✓ {threadCount} supportthread{threadCount === 1 ? "" : "s"}
            </li>
          )}
          {Object.entries(perType).map(([type, count]) => (
            <li key={type}>
              ✓ {count} {TYPE_LABELS[type] ?? type}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
