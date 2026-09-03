import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { verifyWalletAuth } from "@/lib/wallet-auth";
import { uploadToPinata } from "@/lib/utils/pinata";

/**
 * Pin a profile picture, at most once every 30 days per address.
 *
 * ## What this limit can and cannot do
 *
 * It limits PINNING, not the profile. `ProfileRegistry.setProfile` has no
 * cooldown and is ungated, so anyone can set their avatarURI from their own
 * wallet as often as they like and this endpoint will never see it. Claiming
 * otherwise would be a lie about an immutable contract.
 *
 * What it does protect is the thing that actually accrues cost: every upload
 * pins a new file to our Pinata account and nothing unpins the old one. So the
 * limit sits where the spending is.
 *
 * ## Why it is authenticated
 *
 * A per-address limit on an unauthenticated endpoint is decoration — send a
 * different address and the counter resets. So the caller proves control of the
 * address with a signed nonce (`/api/auth/wallet-nonce`, then the wallet-auth
 * headers). /api/upload-pinata remains open and unmetered; this route exists
 * precisely because avatar uploads should not be.
 *
 * The Redis key's own TTL is the cooldown: if the key is there, the address is
 * still waiting, and its remaining TTL is how long. No clock arithmetic, and no
 * way for a stored timestamp to disagree with the expiry.
 */

const COOLDOWN_SECONDS = 30 * 24 * 60 * 60;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const KEY = (address: string) => `avatar:cooldown:${address.toLowerCase()}`;

const AUTH_CONTEXT = "profile-avatar";

/** How long until this address may change its picture again. */
export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  try {
    const ttl = await redis.ttl(KEY(address));
    const waiting = typeof ttl === "number" && ttl > 0;
    return NextResponse.json({
      success: true,
      canChange: !waiting,
      secondsRemaining: waiting ? ttl : 0,
      cooldownSeconds: COOLDOWN_SECONDS,
    });
  } catch {
    // Redis down must not present the limit as reached; the POST still checks.
    return NextResponse.json({
      success: true,
      canChange: true,
      secondsRemaining: 0,
      cooldownSeconds: COOLDOWN_SECONDS,
      unavailable: true,
    });
  }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const address = String(form.get("address") ?? "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "A valid address is required" },
      { status: 400 },
    );
  }

  // Unproven address, unenforceable limit.
  const auth = await verifyWalletAuth(req, address, AUTH_CONTEXT);
  if (!auth.ok) {
    return NextResponse.json(
      {
        error:
          "Prove you control this wallet first. Request a nonce from /api/auth/wallet-nonce and sign it.",
        reason: auth.reason,
      },
      { status: 401 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Use a JPEG, PNG, WebP or GIF." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Keep the picture under 5MB." },
      { status: 400 },
    );
  }

  const key = KEY(address);

  // Reserve the slot BEFORE pinning. Pinning first and recording after leaves a
  // window where two requests both pin and only one is counted -- and a pin
  // cannot be taken back, so the failure would cost money rather than just
  // being wrong. NX means whoever sets it first owns the slot.
  let reserved = false;
  try {
    const set = await redis.set(key, Date.now(), {
      nx: true,
      ex: COOLDOWN_SECONDS,
    });
    // Upstash returns null when NX declined, and a truthy value when it set.
    reserved = set !== null;
    if (!reserved) {
      const ttl = await redis.ttl(key);
      return NextResponse.json(
        {
          error:
            "You can change your profile picture once every 30 days. Try again later.",
          secondsRemaining:
            typeof ttl === "number" && ttl > 0 ? ttl : undefined,
        },
        { status: 429 },
      );
    }
  } catch {
    // Redis unavailable: allow the upload rather than block someone out of a
    // feature because a cache is down. The cost of a missed limit is one pin.
    reserved = false;
  }

  try {
    const cid = await uploadToPinata(file, `avatar-${address.toLowerCase()}`);
    return NextResponse.json({
      success: true,
      ipfsHash: cid,
      avatarURI: `ipfs://${cid}`,
      cooldownSeconds: COOLDOWN_SECONDS,
    });
  } catch (error: any) {
    // The pin failed, so the slot was never used. Releasing it means a failed
    // upload does not cost somebody their monthly change.
    if (reserved) {
      try {
        await redis.del(key);
      } catch {
        // Nothing further to do; the TTL will clear it.
      }
    }
    console.error("[ProfileAvatar] pin failed:", error?.message);
    return NextResponse.json(
      { error: "Could not store the picture. Nothing was changed." },
      { status: 502 },
    );
  }
}
