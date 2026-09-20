/**
 * Browser regressions — the layer nothing else here covers.
 *
 * Run: `npm run test:e2e`   (boots the app itself; pass E2E_BASE_URL to reuse a running one)
 *
 * ## Why this exists
 *
 * `.claude/verify.sh` proves the code compiles, the contracts pass, and 49 invariants hold —
 * all by reading source or decoding fixtures. None of it opens a page. So the bugs that have
 * actually reached users here are exactly the ones still unguarded: a play count rendered
 * ~1000x the on-chain truth, a rename that left the old brand in the UI, a deploy that served
 * the site with no CSS because a `cp` step was lost.
 *
 * These assertions are deliberately **content-agnostic**. They do not encode what any page
 * should say, because that changes weekly and a test nobody can keep true gets deleted. They
 * encode things that are wrong on every page, forever:
 *
 *   - a raw wei value shown to a human
 *   - a page that rendered with no stylesheet
 *   - a page that threw instead of rendering
 *   - a manifest that names a host other than the one that served it
 *
 * Each one has a shipped precedent. None of them needs a wallet, a chain read, or a fixture
 * that goes stale.
 */
import {
  chromium,
  type Browser,
  type ConsoleMessage,
  type Page,
} from "playwright";
import { spawn, type ChildProcess } from "node:child_process";

const PORT = Number(process.env.E2E_PORT ?? 3319);
const EXTERNAL = process.env.E2E_BASE_URL;
const BASE = EXTERNAL ?? `http://127.0.0.1:${PORT}`;

/** Pages that render without a connected wallet. A wallet-gated view is not a smoke target. */
const PAGES = ["/", "/profile", "/discover", "/nft"];

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/**
 * 16+ consecutive digits in text a person reads. 1e18 is 19 digits and every WMON amount is
 * scaled by it, so a formatted balance never reaches 16 digits but an unformatted one always
 * does. Bounded below 19 on purpose: a value that has been divided but not formatted is just
 * as wrong and just as unreadable.
 */
const WEI_SHAPED = /\d{16,}/;

/** Kill the whole process group — see the `detached` note in boot(). */
function stop(proc: ChildProcess | null) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill("SIGTERM"); // group already gone, or never became a leader
  }
}

async function boot(): Promise<ChildProcess | null> {
  if (EXTERNAL) return null;
  // detached so the whole process GROUP can be killed. `npx next start` forks a
  // `next-server` grandchild; SIGTERM to npx alone leaves it holding the port, and the next
  // run then dies with EADDRINUSE on a machine where nothing appears to be running.
  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
    detached: true,
  });

  // DRAIN the pipes. A piped stdout that nobody reads fills its buffer and then blocks the
  // child forever: the app booted fine by hand and "did not answer within 90s" here, because
  // Next dumps a long upstream fetch error on startup and filled the pipe mid-boot. Kept as a
  // capped buffer rather than 'ignore' so a real boot failure can still be printed.
  let log = "";
  const keep = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-4000);
  };
  proc.stdout?.on("data", keep);
  proc.stderr?.on("data", keep);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop(proc);
  throw new Error(
    `app did not answer on ${BASE} within 120s. Last output:\n${log}`,
  );
}

/**
 * The text the page settles on: sample until two consecutive reads match, or give up. Returns
 * whatever the last sample was, so a page stuck mid-render still gets asserted on rather than
 * throwing here.
 */
async function settledText(page: Page, timeoutMs = 25_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let previous = "\u0000";
  let current = "";
  while (Date.now() < deadline) {
    await page.waitForTimeout(750);
    current = (await page.locator("body").innerText()).trim();
    if (current === previous && current.length > 40) return current;
    previous = current;
  }
  return current;
}

async function run(browser: Browser) {
  for (const path of PAGES) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    check(`${path} responds 200`, res?.status(), 200);

    // Wait for the page to SETTLE, not for first content and not for a stopwatch.
    //
    // Both simpler waits are wrong here. A fixed 2.5s delay called /profile blank, because it
    // spends ~6s resolving a wallet before it renders its connect prompt. But "wait until the
    // body has >40 chars" is worse: the server-rendered shell already satisfies that on the
    // first paint, so the wait returned instantly and hydration then REPLACED the shell with
    // "Loading your profile..." (27 chars) - the check failed on a page that was about to
    // render perfectly. Sampling until the text stops changing is the only version that
    // describes what we actually want: whatever the user ends up looking at.
    const text = await settledText(page);

    // --- it rendered something a person could read -----------------------------------------
    check(`${path} renders visible text`, text.length > 40, true);

    // Next's error boundary is the specific thing we must never ship.
    check(
      `${path} is not Next's error screen`,
      /Application error: a client-side exception|Internal Server Error/i.test(
        text,
      ),
      false,
    );

    // --- no raw wei reached the page --------------------------------------------------------
    const weiHit = text.match(WEI_SHAPED)?.[0];
    check(
      `${path} shows no unformatted wei value${weiHit ? ` (found "${weiHit}")` : ""}`,
      weiHit ?? null,
      null,
    );

    // --- the stylesheet actually loaded -----------------------------------------------------
    // The standalone build copies .next/static in as a separate step; when that step is lost
    // the HTML is perfect and the site is unreadable. A served-but-empty stylesheet counts as
    // missing, so this asserts on rule count, not on the tag being present.
    const cssRules = await page.evaluate(() => {
      let n = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          n += sheet.cssRules?.length ?? 0;
        } catch {
          n += 1; // cross-origin sheet: it loaded, we just cannot count it
        }
      }
      return n;
    });
    check(`${path} loaded a non-empty stylesheet`, cssRules > 0, true);

    await page.close();
  }

  // --- the manifest names the host that served it ---------------------------------------
  // The accountAssociation signature is bound to one domain and Farcaster reads homeUrl from
  // the manifest it fetched, so a hardcoded origin breaks one domain during every cutover.
  const manifest = await (
    await fetch(`${BASE}/.well-known/farcaster.json`)
  ).json();
  const host = new URL(BASE).host;
  const urls: string[] = Object.values(manifest.frame ?? {}).filter(
    (v): v is string => typeof v === "string" && v.startsWith("http"),
  );
  check("manifest exposes URLs to check", urls.length > 0, true);
  const foreign = urls.filter((u) => new URL(u).host !== host);
  check(
    `every manifest URL uses the serving host${foreign.length ? ` (stray: ${foreign[0]})` : ""}`,
    foreign.length,
    0,
  );

  // The share an artist is promised, in the copy a user reads. It was shipped as 70% once.
  const blurb = `${manifest.frame?.description ?? ""} ${manifest.frame?.tagline ?? ""}`;
  check("the manifest still promises artists 90%", /90%/.test(blurb), true);
  check(
    "...and does not say 70% anywhere in that copy",
    /70%/.test(blurb),
    false,
  );
}

const proc = await boot();
const browser = await chromium.launch();
try {
  await run(browser);
} finally {
  await browser.close();
  stop(proc);
}

console.log(`\n${checks} browser checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
