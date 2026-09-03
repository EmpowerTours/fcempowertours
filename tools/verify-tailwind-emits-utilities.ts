/**
 * Tailwind must actually emit utility classes.
 *
 * `app/globals.css` used the v3 directives:
 *
 *     @tailwind base;
 *     @tailwind components;
 *     @tailwind utilities;
 *
 * while the installed Tailwind is v4, where those are **silently ignored** —
 * no error, no warning, a CSS file is still produced. The deployed stylesheet
 * carried 362 rules and not one defined `.w-12`, `.text-xs` or `.gap-2`. Every
 * utility class in the app did nothing, from the first commit onward. A 1024px
 * cover image rendered at full viewport width because `w-12 h-12` was inert.
 *
 * Nothing failed loudly: tsc passes, the build succeeds, the page loads. The
 * only symptom is that it looks wrong, which is the one thing no automated
 * check here was looking at.
 *
 * Also guards the config trap: tailwind.config.js sets `colors.green` and
 * `colors.blue` to flat values, which REPLACES those scales. Loading it with
 * `@config` would break `text-green-400` (29 files) and `text-blue-400` (14).
 *
 * Run: npx tsx tools/verify-tailwind-emits-utilities.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const cssPath = join(root, "app/globals.css");
checks++;
if (!existsSync(cssPath)) {
  failures.push("app/globals.css is missing");
}
const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";

// Which major version is installed?
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const declared: string =
  pkg.dependencies?.tailwindcss ?? pkg.devDependencies?.tailwindcss ?? "";
const major = Number(/(\d+)/.exec(declared)?.[1] ?? 0);

checks++;
if (major === 0) {
  failures.push("could not read the installed tailwindcss version");
}

if (major >= 4) {
  checks++;
  if (/^\s*@tailwind\s+(base|components|utilities)\s*;/m.test(css)) {
    failures.push(
      "app/globals.css uses the v3 `@tailwind base/components/utilities` " +
        `directives, but tailwindcss ${declared} is installed. v4 ignores them ` +
        "silently and emits NO utilities — every class in the app becomes inert. " +
        'Use `@import "tailwindcss";`',
    );
  }

  checks++;
  if (!/@import\s+["']tailwindcss["']/.test(css)) {
    failures.push(
      'app/globals.css never does `@import "tailwindcss"`, so v4 emits no ' +
        "utilities at all",
    );
  }

  // Loading the JS config would clobber the green and blue scales.
  const cfgPath = join(root, "tailwind.config.js");
  if (existsSync(cfgPath) && /@config\s+["']/.test(css)) {
    checks++;
    const cfg = readFileSync(cfgPath, "utf8");
    if (/\b(green|blue)\s*:\s*['"]#/.test(cfg)) {
      failures.push(
        "app/globals.css loads tailwind.config.js with @config, and that config " +
          "sets a flat `green`/`blue` colour, which REPLACES the whole scale — " +
          "text-green-400 and text-blue-400 stop resolving across the app",
      );
    }
  }
}

// If a build is present, assert the emitted CSS really contains utilities.
const staticCss = join(root, ".next/static/css");
if (existsSync(staticCss)) {
  const files = readdirSync(staticCss).filter((f) => f.endsWith(".css"));
  if (files.length > 0) {
    const all = files
      .map((f) => readFileSync(join(staticCss, f), "utf8"))
      .join("\n");
    // Utilities this app uses on nearly every screen.
    for (const cls of ["w-12", "text-xs", "gap-2", "flex-wrap"]) {
      checks++;
      if (!all.includes(`.${cls}`)) {
        failures.push(
          `the built CSS in ${relative(root, staticCss)} defines no .${cls} — ` +
            "Tailwind produced a stylesheet with no utilities in it",
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ tailwind emits utilities — ${checks} checks passed`);
