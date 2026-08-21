"use client";
import { useState } from "react";

/**
 * Channel avatars come from YouTube and fail often enough that every place showing one
 * needs the same fallback: the channel's initial on the brand gradient.
 */
export default function ChannelAvatar({ src, name, size, className = "" }: {
  src: string | null;
  name: string;
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "V";

  return (
    <span
      className={`grid flex-none place-items-center overflow-hidden rounded-full bg-gradient-to-br from-accent-pink-light to-accent-blue-light font-extrabold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      aria-hidden="true"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}
