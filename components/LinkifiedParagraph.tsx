"use client";

import { Fragment, type ReactNode } from "react";
import { formatTypography } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

function linkifySegmentToNodes(text: string, linkClassName: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const href = m[0];
    parts.push(
      <a
        key={`${keyPrefix}-a-${k++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {href}
      </a>
    );
    last = m.index + href.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

type BoldPart = { kind: "text" | "bold"; s: string };

/** Split `**bold**` segments; unclosed `**` falls back to plain text. */
function splitMarkdownBoldParts(input: string): BoldPart[] {
  const out: BoldPart[] = [];
  let rest = input;
  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) {
      out.push({ kind: "text", s: rest });
      break;
    }
    if (open > 0) {
      out.push({ kind: "text", s: rest.slice(0, open) });
    }
    const afterOpen = rest.slice(open + 2);
    const close = afterOpen.indexOf("**");
    if (close === -1) {
      out.push({ kind: "text", s: rest.slice(open) });
      break;
    }
    out.push({ kind: "bold", s: afterOpen.slice(0, close) });
    rest = afterOpen.slice(close + 2);
  }
  return out;
}

type LinkifiedParagraphProps = {
  text: string;
  className?: string;
  /** Tailwind classes for link spans; defaults to blue underlined links. */
  linkClassName?: string;
};

/**
 * 纯文本中的 http(s) 链接拆成可点击 <a>，无 dangerouslySetInnerHTML。
 */
const DEFAULT_LINK_CLASS =
  "break-all text-[#0055FF] underline decoration-[#0055FF]/40 hover:decoration-[#0055FF]";

export default function LinkifiedParagraph({ text, className, linkClassName }: LinkifiedParagraphProps) {
  if (!text) return null;

  const normalized = formatTypography(text);
  const lc = linkClassName ?? DEFAULT_LINK_CLASS;
  const parts = linkifySegmentToNodes(normalized, lc, "p");

  return (
    <p className={className ?? "m-0"}>
      {parts.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </p>
  );
}

type BoldLinkifiedInlineProps = {
  text: string;
  className?: string;
  linkClassName?: string;
  /** className for <strong> wrapping **...** */
  boldClassName?: string;
};

/**
 * Inline `**bold**` + http(s) links, for insight bullets (no outer block margin).
 */
export function BoldLinkifiedInline({
  text,
  className,
  linkClassName,
  boldClassName = "font-semibold text-[#101828]",
}: BoldLinkifiedInlineProps) {
  if (!text) return null;
  const normalized = formatTypography(text);
  const lc = linkClassName ?? DEFAULT_LINK_CLASS;
  const parts = splitMarkdownBoldParts(normalized);
  return (
    <span className={className}>
      {parts.map((part, pi) => {
        const seg = linkifySegmentToNodes(part.s, lc, `i-${pi}`);
        if (part.kind === "bold") {
          return (
            <strong key={pi} className={boldClassName}>
              {seg.map((n, i) => (
                <Fragment key={i}>{n}</Fragment>
              ))}
            </strong>
          );
        }
        return (
          <Fragment key={pi}>
            {seg.map((n, i) => (
              <Fragment key={i}>{n}</Fragment>
            ))}
          </Fragment>
        );
      })}
    </span>
  );
}
