"use client";

import React, { Fragment, type ReactNode } from "react";
import katex from "katex";
import { formatTypography } from "@/lib/utils";

type MathSegment = {
  kind: "math";
  value: string;
  display: boolean;
  delimiter: "$" | "$$" | "\\(" | "\\[" | "bare";
  original?: string;
} | {
  kind: "text";
  value: string;
};

type TextSegmentRenderer = (text: string, keyPrefix: string) => ReactNode;

type MathInlineTextProps = {
  text: string;
  renderTextSegment?: TextSegmentRenderer;
};

type MathBlockTextProps = {
  text: string;
  textClassName: string;
  displayClassName?: string;
  renderTextSegment?: TextSegmentRenderer;
};

const DEFAULT_DISPLAY_CLASS =
  "longform-math-display my-1 max-w-full overflow-x-auto rounded-md border border-[#f3f4f6] bg-[#fcfcfd] px-3 py-3 text-center text-[14px] text-[#101828]";

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function canOpenInlineDollar(text: string, index: number): boolean {
  if (text[index] !== "$" || text[index + 1] === "$" || isEscaped(text, index)) return false;
  const next = text[index + 1];
  if (!next || /\s|\d/.test(next)) return false;
  return true;
}

function canCloseInlineDollar(text: string, index: number): boolean {
  if (text[index] !== "$" || text[index + 1] === "$" || isEscaped(text, index)) return false;
  const prev = text[index - 1];
  if (!prev || /\s/.test(prev)) return false;
  return true;
}

function findClosingInlineDollar(text: string, start: number): number {
  for (let i = start; i < text.length; i += 1) {
    if (canCloseInlineDollar(text, i)) return i;
  }
  return -1;
}

function pushPlainTextSegment(segments: MathSegment[], value: string) {
  if (!value) return;
  const previous = segments[segments.length - 1];
  if (previous?.kind === "text") {
    previous.value += value;
    return;
  }
  segments.push({ kind: "text", value });
}

const BARE_MATH_RE =
  /(^|[^A-Za-z0-9_$\\])([A-Za-z0-9_\\()[\]{}.+\-*/^]+(?:\s+[A-Za-z0-9_\\()[\]{}.+\-*/^]+)*\s*(?:⊂|⊆|⊃|⊇|∈|∉|=|≠|≤|≥|≈|<|>)\s*[A-Za-z0-9_\\()[\]{}.+\-*/^]+(?:\s+[A-Za-z0-9_\\()[\]{}.+\-*/^]+)*)/g;

const BARE_OPERATOR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/⊆/g, " \\subseteq "],
  [/⊂/g, " \\subset "],
  [/⊇/g, " \\supseteq "],
  [/⊃/g, " \\supset "],
  [/∉/g, " \\notin "],
  [/∈/g, " \\in "],
  [/≠/g, " \\ne "],
  [/≤/g, " \\le "],
  [/≥/g, " \\ge "],
  [/≈/g, " \\approx "],
];

function normalizeBareMathExpression(raw: string): string {
  let expr = raw.trim();
  for (const [pattern, replacement] of BARE_OPERATOR_REPLACEMENTS) {
    expr = expr.replace(pattern, replacement);
  }

  return expr
    .replace(/\b([A-Za-z][A-Za-z0-9]*)_([A-Za-z0-9]+)\b/g, "$1_{$2}")
    .replace(/\b([A-Za-z][A-Za-z0-9]*)\^([A-Za-z0-9]+)\b/g, "$1^{$2}")
    .replace(/\s+/g, " ")
    .trim();
}

function isBareMathCandidate(raw: string): boolean {
  const clean = raw.trim();
  return (
    clean.length >= 5 &&
    clean.length <= 140 &&
    /[A-Za-z]/.test(clean) &&
    /[⊂⊆⊃⊇∈∉=≠≤≥≈<>]/.test(clean) &&
    !/^https?:\/\//i.test(clean)
  );
}

function canRenderMath(value: string): boolean {
  try {
    katex.renderToString(value, {
      displayMode: false,
      throwOnError: true,
      strict: false,
      trust: false,
    });
    return true;
  } catch {
    return false;
  }
}

function splitBareMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(BARE_MATH_RE.source, BARE_MATH_RE.flags);

  while ((match = re.exec(text)) !== null) {
    const prefix = match[1] || "";
    const original = match[2] || "";
    const start = match.index + prefix.length;
    const end = start + original.length;
    const value = normalizeBareMathExpression(original);

    if (!isBareMathCandidate(original) || !canRenderMath(value)) {
      continue;
    }

    pushPlainTextSegment(segments, text.slice(last, start));
    segments.push({ kind: "math", value, display: false, delimiter: "bare", original });
    last = end;
  }

  pushPlainTextSegment(segments, text.slice(last));
  return segments;
}

function pushTextSegment(segments: MathSegment[], value: string) {
  for (const segment of splitBareMathSegments(value)) {
    if (segment.kind === "text") {
      pushPlainTextSegment(segments, segment.value);
    } else {
      segments.push(segment);
    }
  }
}

function splitMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let cursor = 0;
  let segmentStart = 0;

  const pushPendingText = () => {
    pushTextSegment(segments, text.slice(segmentStart, cursor));
  };

  while (cursor < text.length) {
    if (text.startsWith("$$", cursor) && !isEscaped(text, cursor)) {
      const close = text.indexOf("$$", cursor + 2);
      if (close !== -1) {
        const value = text.slice(cursor + 2, close).trim();
        if (value) {
          pushPendingText();
          segments.push({ kind: "math", value, display: true, delimiter: "$$" });
          cursor = close + 2;
          segmentStart = cursor;
          continue;
        }
      }
    }

    if (text.startsWith("\\[", cursor) && !isEscaped(text, cursor)) {
      const close = text.indexOf("\\]", cursor + 2);
      if (close !== -1) {
        const value = text.slice(cursor + 2, close).trim();
        if (value) {
          pushPendingText();
          segments.push({ kind: "math", value, display: true, delimiter: "\\[" });
          cursor = close + 2;
          segmentStart = cursor;
          continue;
        }
      }
    }

    if (text.startsWith("\\(", cursor) && !isEscaped(text, cursor)) {
      const close = text.indexOf("\\)", cursor + 2);
      if (close !== -1) {
        const value = text.slice(cursor + 2, close).trim();
        if (value) {
          pushPendingText();
          segments.push({ kind: "math", value, display: false, delimiter: "\\(" });
          cursor = close + 2;
          segmentStart = cursor;
          continue;
        }
      }
    }

    if (canOpenInlineDollar(text, cursor)) {
      const close = findClosingInlineDollar(text, cursor + 1);
      if (close !== -1) {
        const value = text.slice(cursor + 1, close).trim();
        if (value) {
          pushPendingText();
          segments.push({ kind: "math", value, display: false, delimiter: "$" });
          cursor = close + 1;
          segmentStart = cursor;
          continue;
        }
      }
    }

    cursor += 1;
  }

  pushTextSegment(segments, text.slice(segmentStart));
  return segments;
}

function renderKatex(value: string, displayMode: boolean): string {
  return katex.renderToString(value, {
    displayMode,
    output: "htmlAndMathml",
    throwOnError: false,
    strict: false,
    trust: false,
  });
}

function getOriginalMathText(segment: Extract<MathSegment, { kind: "math" }>): string {
  if (segment.delimiter === "$$") return `$$${segment.value}$$`;
  if (segment.delimiter === "\\[") return `\\[${segment.value}\\]`;
  if (segment.delimiter === "\\(") return `\\(${segment.value}\\)`;
  if (segment.delimiter === "bare") return segment.original ?? segment.value;
  return `$${segment.value}$`;
}

function MathNode({
  segment,
  forceInline = false,
  displayClassName = DEFAULT_DISPLAY_CLASS,
}: {
  segment: Extract<MathSegment, { kind: "math" }>;
  forceInline?: boolean;
  displayClassName?: string;
}) {
  const displayMode = segment.display && !forceInline;

  try {
    const html = renderKatex(segment.value, displayMode);
    if (displayMode) {
      return (
        <div
          className={displayClassName}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    return (
      <span
        className="longform-math-inline align-baseline text-[#101828]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <span className="break-all font-mono text-[0.95em] text-primary-600">
        {getOriginalMathText(segment)}
      </span>
    );
  }
}

function renderInlineSegments(
  text: string,
  forceInline = true,
  renderTextSegment?: TextSegmentRenderer,
): ReactNode[] {
  return splitMathSegments(text).map((segment, index) => {
    if (segment.kind === "text") {
      return (
        <Fragment key={index}>
          {renderTextSegment
            ? renderTextSegment(segment.value, `text-${index}`)
            : formatTypography(segment.value)}
        </Fragment>
      );
    }

    return (
      <MathNode
        key={index}
        segment={segment}
        forceInline={forceInline}
      />
    );
  });
}

export function MathInlineText({ text, renderTextSegment }: MathInlineTextProps) {
  if (!text) return null;
  return <>{renderInlineSegments(text, true, renderTextSegment)}</>;
}

export function MathBlockText({
  text,
  textClassName,
  displayClassName = DEFAULT_DISPLAY_CLASS,
  renderTextSegment,
}: MathBlockTextProps) {
  if (!text) return null;

  const segments = splitMathSegments(text);
  const hasDisplayMath = segments.some((segment) => segment.kind === "math" && segment.display);

  if (!hasDisplayMath) {
    return (
      <p className={textClassName}>
        {renderInlineSegments(text, true, renderTextSegment)}
      </p>
    );
  }

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          const formatted = segment.value.trim();
          if (!formatted) return null;
          return (
            <p key={index} className={textClassName}>
              {renderInlineSegments(formatted, true, renderTextSegment)}
            </p>
          );
        }

        return (
          <MathNode
            key={index}
            segment={segment}
            displayClassName={displayClassName}
          />
        );
      })}
    </>
  );
}
