"use client";

import { useState } from "react";

type SourceAvatarImgProps = {
  src?: string;
  alt: string;
  letter: string;
  imgClassName: string;
  placeholderClassName: string;
  priority?: boolean;
};

/**
 * 外链头像用原生 img（避免 next/image 未配置域名时整图不显示），加载失败回退首字母。
 * Referrer：勿用 no-referrer，pbs.twimg.com 等 CDN 常因此拒图。
 */
export default function SourceAvatarImg({
  src,
  alt,
  letter,
  imgClassName,
  placeholderClassName,
  priority = false,
}: SourceAvatarImgProps) {
  const [failed, setFailed] = useState(false);

  if (!src?.trim() || failed) {
    return (
      <div className={placeholderClassName} aria-hidden>
        {letter.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src.trim()}
      alt={alt}
      width={24}
      height={24}
      className={imgClassName}
      loading={priority ? "eager" : "lazy"}
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore fetchPriority is still experimental in some TS DOM lib versions
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => setFailed(true)}
    />
  );
}
