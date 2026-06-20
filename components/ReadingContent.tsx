"use client";

import React, { Fragment, useMemo, type ReactNode } from "react";
import {
  buildReadingAnnotationPlan,
  getReadingFacetLabel,
  type ReadingBlockAnnotation,
  type ReadingContentBlock,
  type ReadingFacet,
} from "@/lib/reading-annotations";
import { formatTypography } from "@/lib/utils";
import { MathBlockText, MathInlineText } from "@/components/MathText";

export type { ReadingContentBlock } from "@/lib/reading-annotations";

type ReadingContentProps = {
  blocks: ReadingContentBlock[];
  idPrefix: string;
  title?: string;
};

type ReadingMatch = {
  end: number;
  index: number;
  term?: string;
  type: "claim" | "term";
};

function isLatinTerm(text: string): boolean {
  return /^[A-Za-z0-9@_.+-]+(?:\s+[A-Za-z0-9@_.+-]+)*$/.test(text);
}

function hasTermBoundary(text: string, start: number, end: number, term: string): boolean {
  if (!isLatinTerm(term)) return true;
  const prev = text[start - 1];
  const next = text[end];
  return !/[A-Za-z0-9@_.+-]/.test(prev || "") && !/[A-Za-z0-9@_.+-]/.test(next || "");
}

function findNextTerm(text: string, cursor: number, terms: string[]): ReadingMatch | null {
  const lowerText = text.toLowerCase();
  let best: ReadingMatch | null = null;

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    let index = lowerText.indexOf(lowerTerm, cursor);

    while (index !== -1) {
      const end = index + term.length;
      if (hasTermBoundary(text, index, end, term)) {
        if (
          !best ||
          index < best.index ||
          (index === best.index && term.length > (best.term?.length ?? 0))
        ) {
          best = { index, end, term, type: "term" };
        }
        break;
      }
      index = lowerText.indexOf(lowerTerm, index + 1);
    }
  }

  return best;
}

function findNextMatch(
  text: string,
  cursor: number,
  annotation: ReadingBlockAnnotation,
): ReadingMatch | null {
  const termMatch = findNextTerm(text, cursor, annotation.emphasisTerms);
  const claim = annotation.claim ? formatTypography(annotation.claim).trim() : "";
  const claimIndex = claim.length >= 12 ? text.indexOf(claim, cursor) : -1;
  const claimMatch =
    claimIndex >= 0
      ? {
          index: claimIndex,
          end: claimIndex + claim.length,
          type: "claim" as const,
        }
      : null;

  if (!claimMatch) return termMatch;
  if (!termMatch) return claimMatch;
  if (claimMatch.index < termMatch.index) return claimMatch;
  if (claimMatch.index === termMatch.index && claimMatch.end >= termMatch.end) return claimMatch;
  return termMatch;
}

function renderAnnotatedText(
  text: string,
  annotation: ReadingBlockAnnotation,
  keyPrefix: string,
): ReactNode {
  const formatted = formatTypography(text);
  if (!annotation.claim && annotation.emphasisTerms.length === 0) return formatted;

  const nodes: ReactNode[] = [];
  const termHits = new Map<string, number>();
  const maxTermHits = annotation.claim ? 1 : 2;
  let totalTermHits = 0;
  let cursor = 0;

  while (cursor < formatted.length) {
    const match = findNextMatch(formatted, cursor, annotation);
    if (!match) break;

    if (match.index > cursor) {
      nodes.push(formatted.slice(cursor, match.index));
    }

    const visible = formatted.slice(match.index, match.end);

    if (match.type === "claim") {
      nodes.push(
        <strong key={`${keyPrefix}-claim-${match.index}`} className="font-medium text-[#101828]">
          {visible}
        </strong>,
      );
    } else if (match.term && totalTermHits < maxTermHits) {
      const key = match.term.toLowerCase();
      const count = termHits.get(key) ?? 0;
      if (count < 1) {
        termHits.set(key, count + 1);
        totalTermHits += 1;
        nodes.push(
          <strong key={`${keyPrefix}-term-${match.index}`} className="font-semibold text-[#101828]">
            {visible}
          </strong>,
        );
      } else {
        nodes.push(visible);
      }
    } else {
      nodes.push(visible);
    }

    cursor = match.end;
  }

  if (cursor < formatted.length) {
    nodes.push(formatted.slice(cursor));
  }

  return nodes.length > 0 ? nodes : formatted;
}

function ReadingFacetLabel({ facet }: { facet: ReadingFacet }) {
  return (
    <span className="mr-2 inline-flex translate-y-[-1px] items-center rounded-[3px] border border-[#e5e7eb] px-1.5 py-0 text-[11px] font-semibold leading-4 text-[#6a7282]">
      {getReadingFacetLabel(facet)}
    </span>
  );
}

function renderInlineListText(
  text: string,
  annotation: ReadingBlockAnnotation,
  keyPrefix: string,
) {
  return (
    <MathInlineText
      text={text}
      renderTextSegment={(segment, segmentKey) => (
        <Fragment key={segmentKey}>
          {renderAnnotatedText(segment, annotation, `${keyPrefix}-${segmentKey}`)}
        </Fragment>
      )}
    />
  );
}

export default function ReadingContent({ blocks, idPrefix, title = "" }: ReadingContentProps) {
  const annotations = useMemo(
    () => buildReadingAnnotationPlan(blocks, title),
    [blocks, title],
  );

  return (
    <div className="flex w-full flex-col">
      {blocks.map((block, blockIndex) => {
        const annotation = annotations[blockIndex] ?? { emphasisTerms: [] };
        const key = `${idPrefix}-${blockIndex}`;

        if (block.kind === "heading") {
          return (
            <h4
              key={key}
              className={[
                "m-0 break-words text-[15px] font-semibold leading-7 text-[#101828]",
                blockIndex > 0 ? "mt-6" : "",
              ].join(" ")}
            >
              <MathInlineText text={block.text} />
            </h4>
          );
        }

        if (block.kind === "list") {
          const listClassName = [
            "m-0 list-outside space-y-2 pl-5 text-[15px] font-normal leading-7 text-[#101828] marker:text-[11px] marker:font-semibold marker:text-[#99a1af] sm:leading-[30px]",
            block.ordered ? "list-decimal" : "list-disc",
            blockIndex > 0 ? "mt-4" : "",
          ].join(" ");

          return block.ordered ? (
            <ol key={key} className={listClassName}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className="break-words pl-1">
                  {renderInlineListText(item, annotation, `${key}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          ) : (
            <ul key={key} className={listClassName}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className="break-words pl-1">
                  {renderInlineListText(item, annotation, `${key}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <div
            key={key}
            className={[
              "w-full",
              blockIndex > 0 ? "mt-4" : "",
            ].join(" ")}
          >
            <MathBlockText
              text={block.text}
              textClassName="m-0 break-words text-[15px] font-normal leading-7 text-[#101828] [text-wrap:pretty] sm:leading-[30px]"
              prefix={annotation.facet ? <ReadingFacetLabel facet={annotation.facet} /> : undefined}
              renderTextSegment={(segment, segmentKey) => (
                <Fragment key={segmentKey}>
                  {renderAnnotatedText(segment, annotation, `${key}-${segmentKey}`)}
                </Fragment>
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
