"use client";

import React, { useState } from "react";
import { AVATAR_PX, resolveAvatarUri } from "@/lib/profile-avatar";

/**
 * A profile picture that cannot grow, even with no stylesheet.
 *
 * `width`/`height` are HTML attributes, not just classes. Ganado's 1024px cover
 * filled a phone screen because Tailwind was emitting no utilities and `w-12
 * h-12` did nothing, so the image fell back to its natural size. Attributes and
 * an inline style both hold with zero CSS, so this is capped three ways over.
 *
 * A rejected or missing URI renders the initial rather than a broken image —
 * see `resolveAvatarUri` for why an arbitrary on-chain URL is not displayed.
 */

interface Props {
  /** Raw avatarURI as stored on chain. */
  uri?: string | null;
  /** Used for the fallback initial and alt text. */
  name?: string | null;
  size?: number;
  className?: string;
}

export function ProfileAvatar({
  uri,
  name,
  size = AVATAR_PX,
  className,
}: Props) {
  const [failed, setFailed] = useState(false);
  const src = resolveAvatarUri(uri);
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  // Belt and braces: attributes, inline style, and classes. Any one of the
  // three alone is enough to keep it small.
  const box = {
    width: size,
    height: size,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
  } as const;

  if (!src || failed) {
    return (
      <div
        style={box}
        className={`rounded-full bg-gray-700 text-gray-300 flex items-center justify-center font-semibold shrink-0 ${className ?? ""}`}
        aria-label={
          name ? `${name} has no profile picture` : "No profile picture"
        }
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name ? `${name}'s profile picture` : "Profile picture"}
      width={size}
      height={size}
      style={box}
      onError={() => setFailed(true)}
      className={`rounded-full object-cover shrink-0 ${className ?? ""}`}
    />
  );
}
