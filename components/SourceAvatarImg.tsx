"use client";

import { useEffect, useState } from "react";

const avatarLoadCache = new Map<string, { src: string; failed: boolean }>();

type SourceAvatarImgProps = {
  src?: unknown;
  /** 主图加载失败时尝试的备用 URL（如 unavatar 另一路径） */
  fallbackSrc?: unknown;
  alt: string;
  letter: unknown;
  imgClassName: string;
  placeholderClassName: string;
  priority?: boolean;
  instantFallback?: boolean;
};

function safeSrc(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeLetter(value: unknown): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "?";
  return (text.trim().charAt(0) || "?").toUpperCase();
}

function cacheKey(src: string, fallbackSrc?: unknown) {
  return `${src}\n${safeSrc(fallbackSrc)}`;
}

function cachedInitialState(src?: unknown, fallbackSrc?: unknown, instantFallback = false) {
  const initialSrc = safeSrc(src);
  const fb = safeSrc(fallbackSrc);
  const cached = avatarLoadCache.get(cacheKey(initialSrc, fallbackSrc));
  if (cached) {
    return { activeSrc: cached.src, failed: cached.failed };
  }
  if (instantFallback && fb && initialSrc && initialSrc !== fb) {
    return { activeSrc: fb, failed: false };
  }
  return { activeSrc: initialSrc, failed: false };
}

/**
 * 外链头像用原生 img（避免 next/image 未配置域名时整图不显示），加载失败回退首字母。
 * Referrer：勿用 no-referrer，pbs.twimg.com 等 CDN 常因此拒图。
 */
export default function SourceAvatarImg({
  src,
  fallbackSrc,
  alt,
  letter,
  imgClassName,
  placeholderClassName,
  priority = false,
  instantFallback = false,
}: SourceAvatarImgProps) {
  const initial = cachedInitialState(src, fallbackSrc, instantFallback);
  const [activeSrc, setActiveSrc] = useState(initial.activeSrc);
  const [failed, setFailed] = useState(initial.failed);

  useEffect(() => {
    const nextSrc = safeSrc(src);
    const fb = safeSrc(fallbackSrc);
    const cached = avatarLoadCache.get(cacheKey(nextSrc, fallbackSrc));
    if (cached) {
      setActiveSrc(cached.src);
      setFailed(cached.failed);
      return;
    }
    if (instantFallback && fb && nextSrc && nextSrc !== fb) {
      setActiveSrc(fb);
      setFailed(false);
      return;
    }
    setActiveSrc(nextSrc);
    setFailed(false);
  }, [src, fallbackSrc, instantFallback]);

  const primarySrc = safeSrc(src);
  const fb = safeSrc(fallbackSrc);
  const displaySrc = activeSrc || primarySrc || "";
  const shouldPreloadPrimary =
    instantFallback &&
    !!primarySrc &&
    !!fb &&
    primarySrc !== fb &&
    displaySrc === fb &&
    !failed;

  useEffect(() => {
    if (!shouldPreloadPrimary) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.referrerPolicy = "strict-origin-when-cross-origin";
    image.onload = () => {
      if (cancelled) return;
      avatarLoadCache.set(cacheKey(primarySrc, fallbackSrc), {
        src: primarySrc,
        failed: false,
      });
      setActiveSrc(primarySrc);
      setFailed(false);
    };
    image.onerror = () => {
      avatarLoadCache.set(cacheKey(primarySrc, fallbackSrc), {
        src: fb,
        failed: false,
      });
    };
    image.src = primarySrc;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [fb, fallbackSrc, primarySrc, shouldPreloadPrimary]);

  if (!displaySrc || failed) {
    return (
      <div className={placeholderClassName} aria-hidden>
        {safeLetter(letter)}
      </div>
    );
  }

  const fetchPriorityProps = {
    fetchPriority: priority ? "high" : "auto",
  } as { fetchPriority?: "high" | "low" | "auto" };
  const loading = priority ? "eager" : "lazy";

  return (
    <img
      src={displaySrc}
      alt={alt}
      width={32}
      height={32}
      className={imgClassName}
      loading={loading}
      {...fetchPriorityProps}
      decoding="async"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => {
        if (displaySrc === primarySrc || !primarySrc) {
          avatarLoadCache.set(cacheKey(primarySrc, fallbackSrc), {
            src: displaySrc,
            failed: false,
          });
        }
      }}
      onError={() => {
        if (fb && displaySrc !== fb) {
          avatarLoadCache.set(cacheKey(primarySrc, fallbackSrc), {
            src: fb,
            failed: false,
          });
          setActiveSrc(fb);
          return;
        }
        avatarLoadCache.set(cacheKey(primarySrc, fallbackSrc), {
          src: "",
          failed: true,
        });
        setFailed(true);
      }}
    />
  );
}
