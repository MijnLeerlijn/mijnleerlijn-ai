import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettierConfig from "eslint-config-prettier";

// Afhankelijkheidsregels uit docs/PLATFORM-FOUNDATION.md §2, afgedwongen met
// ESLint's ingebouwde no-restricted-imports (geen extra library nodig, zie
// "geen nieuwe libraries zonder duidelijke noodzaak").
const featuresEnServices = [
  {
    group: ["@/features/*", "@/features"],
    message: "components/ mag nooit importeren uit features/ — zie PLATFORM-FOUNDATION.md §2, regel 5.",
  },
  {
    group: ["@/services/*", "@/services"],
    message:
      "components/ mag nooit rechtstreeks services/ aanroepen — zie PLATFORM-FOUNDATION.md §2, regel 6.",
  },
];

const boundaryRules = [
  {
    files: ["components/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: featuresEnServices }],
    },
  },
  {
    files: ["components/atoms/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/molecules/*", "@/components/organisms/*", "@/components/layouts/*"],
              message:
                "Atoms mogen nooit importeren uit molecules/organisms/layouts — zie PLATFORM-FOUNDATION.md §2, regel 1.",
            },
            ...featuresEnServices,
          ],
        },
      ],
    },
  },
  {
    files: ["components/molecules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/organisms/*", "@/components/layouts/*"],
              message:
                "Molecules mogen alleen atoms gebruiken, nooit organisms/layouts — zie PLATFORM-FOUNDATION.md §2, regel 3.",
            },
            ...featuresEnServices,
          ],
        },
      ],
    },
  },
  {
    files: ["components/organisms/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/layouts/*"],
              message:
                "Organisms mogen nooit uit layouts importeren — layouts stellen organisms samen, niet andersom. Zie PLATFORM-FOUNDATION.md §2, regel 4.",
            },
            ...featuresEnServices,
          ],
        },
      ],
    },
  },
  {
    files: ["components/layouts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: featuresEnServices }],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...boundaryRules,
  prettierConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
