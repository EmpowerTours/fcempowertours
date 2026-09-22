import { NextResponse } from "next/server";
import { uploadToPinata } from "@/lib/utils/pinata";

/**
 * POST /api/climb-photo
 *
 * Pins a climb photo to IPFS on behalf of the version1 Telegram dapp and returns
 * an `ipfs://<cid>` URI to store on chain.
 *
 * ## Why this endpoint rather than version1 pinning directly
 *
 * The same trade this app already made for `/api/climb-stamp`: a Pinata JWT can
 * pin unlimited data to a paid account, and version1 is a Telegram bot ingesting
 * arbitrary user photos. Putting that credential on a second host to save one
 * HTTP call is the wrong way round. `PINATA_JWT` lives here, and only here.
 *
 * ## Why `ipfs://` and not a gateway URL
 *
 * ClimbingLocationsV2 rewrites exactly one prefix:
 *
 *     ipfs://<cid>  ->  https://harlequin-used-hare-224.mypinata.cloud/ipfs/<cid>
 *
 * and returns anything else unchanged. So `ipfs://` is the only form that comes
 * out of `tokenURI` as a fetchable https URL — which matters because MetaMask
 * will not resolve `ipfs://` on Monad. Returning a gateway URL here would work
 * today and silently hardcode a gateway into immutable token metadata.
 *
 * ## What this replaces
 *
 * version1 previously stored `keccak256(telegram_file_id)` in `photoProofIPFS`.
 * That is not a hash of the image — it is a hash of Telegram's opaque file
 * handle, and it is irreversible, so the photo could not be recovered by anyone
 * including Telegram. Every NFT minted that way renders as a blank tile forever;
 * the fields have no setter.
 *
 * ## Authentication
 *
 * The shared `CLIMB_STAMP_SECRET`, already set on both services. Absent secret
 * closes the route rather than opening it — an endpoint that spends paid storage
 * must not default to allowing everyone.
 *
 * Deliberately NOT IP rate limited: the only caller is version1's server, so a
 * per-IP limit would throttle every climber through one bucket and reject honest
 * climbs under load. The bearer secret is the gate; the size cap is the cost
 * bound.
 */

/** Telegram compresses photos well under this; the cap bounds a bad caller. */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const secret = process.env.CLIMB_STAMP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "climb photo pinning is not configured" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.PINATA_JWT) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file field is required" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file exceeds ${MAX_BYTES} bytes` },
      { status: 413 },
    );
  }
  // Reject by default: an explicit image type, not "anything not obviously bad".
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "file must be an image" },
      { status: 415 },
    );
  }

  const rawName = String(form.get("name") ?? "").trim();
  const name = (rawName || "climb-photo").slice(0, 60);

  try {
    const cid = await uploadToPinata(file, name);
    if (!cid) {
      return NextResponse.json(
        { error: "pin returned no cid" },
        { status: 502 },
      );
    }
    return NextResponse.json({ cid, uri: `ipfs://${cid}` });
  } catch (err: unknown) {
    const reason =
      err instanceof Error
        ? err.message.slice(0, 140)
        : String(err).slice(0, 140);
    console.error("[ClimbPhoto] pin failed:", reason);
    return NextResponse.json({ error: "pin failed", reason }, { status: 502 });
  }
}
