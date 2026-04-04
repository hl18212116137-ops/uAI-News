"use client";

import { useEffect, useState } from "react";

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

  // #region agent log
  useEffect(() => {
    const s = src?.trim() ?? "";
    let host = "empty";
    try {
      if (s) host = new URL(s).hostname;
    } catch {
      host = "invalid-url";
    }
    fetch("http://127.0.0.1:7244/ingest/bb9e1b63-49d7-497c-83f1-785c798544f6", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "a3f67d",
      },
      body: JSON.stringify({
        sessionId: "a3f67d",
        hypothesisId: "H1-H3",
        location: "SourceAvatarImg.tsx:mount",
        message: "avatar src snapshot",
        data: { hasSrc: !!s, host, failed, altLen: alt?.length ?? 0 },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [src, failed, alt]);
  // #endregion

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
      onError={() => {
        // #region agent log
        let host = "unknown";
        try {
          host = new URL(src.trim()).hostname;
        } catch {
          host = "invalid-url";
        }
        fetch("http://127.0.0.1:7244/ingest/bb9e1b63-49d7-497c-83f1-785c798544f6", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "a3f67d",
          },
          body: JSON.stringify({
            sessionId: "a3f67d",
            hypothesisId: "H2-H5",
            location: "SourceAvatarImg.tsx:onError",
            message: "img load failed",
            data: { host },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setFailed(true);
      }}
    />
  );
}
