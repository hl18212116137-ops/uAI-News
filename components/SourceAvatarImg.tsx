"use client";

import { useEffect, useState } from "react";

const avatarLoadCache = new Map<string, { src: string; failed: boolean }>();

type SourceAvatarImgProps = {
  src?: string;
  /** 主图加载失败时尝试的备用 URL（如 unavatar 另一路径） */
  fallbackSrc?: string;
  alt: string;
  letter: string;
  imgClassName: string;
  placeholderClassName: string;
  priority?: boolean;
};

function cacheKey(src: string, fallbackSrc?: string) {
  return `${src}\n${fallbackSrc?.trim() ?? ""}`;
}

function cachedInitialState(src?: string, fallbackSrc?: string) {
  const initialSrc = src?.trim() ?? "";
  const cached = avatarLoadCache.get(cacheKey(initialSrc, fallbackSrc));
  if (cached) {
    return { activeSrc: cached.src, failed: cached.failed };
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
}: SourceAvatarImgProps) {
  const initial = cachedInitialState(src, fallbackSrc);
  const [activeSrc, setActiveSrc] = useState(initial.activeSrc);
  const [failed, setFailed] = useState(initial.failed);

  useEffect(() => {
    const nextSrc = src?.trim() ?? "";
    const cached = avatarLoadCache.get(cacheKey(nextSrc, fallbackSrc));
    if (cached) {
      setActiveSrc(cached.src);
      setFailed(cached.failed);
      return;
    }
    setActiveSrc(nextSrc);
    setFailed(false);
  }, [src, fallbackSrc]);

  const displaySrc = activeSrc || src?.trim() || "";

  if (!displaySrc || failed) {
    return (
      <div className={placeholderClassName} aria-hidden>
        {letter.charAt(0).toUpperCase()}
      </div>
    );
  }

  const fetchPriorityProps = {
    fetchPriority: priority ? "high" : "auto",
  } as { fetchPriority?: "high" | "low" | "auto" };

  return (
    <img
      src={displaySrc}
      alt={alt}
      width={32}
      height={32}
      className={imgClassName}
      loading={priority ? "eager" : "lazy"}
      {...fetchPriorityProps}
      decoding="async"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => {
        avatarLoadCache.set(cacheKey(src?.trim() ?? "", fallbackSrc), {
          src: displaySrc,
          failed: false,
        });
      }}
      onError={() => {
        const fb = fallbackSrc?.trim();
        if (fb && displaySrc !== fb) {
          setActiveSrc(fb);
          return;
        }
        avatarLoadCache.set(cacheKey(src?.trim() ?? "", fallbackSrc), {
          src: "",
          failed: true,
        });
        setFailed(true);
      }}
    />
  );
}
