"use client";

export type SourceActivityTone = "working" | "success" | "error";

type SourceActivityNoticeProps = {
  title: string;
  detail: string;
  tone: SourceActivityTone;
  isLeaving?: boolean;
};

function StatusGlyph({ tone }: { tone: SourceActivityTone }) {
  if (tone === "working") {
    return (
      <span
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0055FF]/25 border-t-[#0055FF]"
        aria-hidden
      />
    );
  }

  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      {tone === "success" ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 12.5 9.2 17 19 7"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v5m0 3h.01M4.9 19h14.2c1.5 0 2.45-1.62 1.7-2.92L13.7 3.8a1.96 1.96 0 0 0-3.4 0L3.2 16.08C2.45 17.38 3.4 19 4.9 19Z"
        />
      )}
    </svg>
  );
}

export default function SourceActivityNotice({
  title,
  detail,
  tone,
  isLeaving = false,
}: SourceActivityNoticeProps) {
  const toneClass =
    tone === "error"
      ? "border-primary-100 text-primary-600"
      : tone === "success"
        ? "border-[#d9eadf] text-[#18794e]"
        : "border-[#dbe7ff] text-[#0055FF]";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[68px] z-[120] flex justify-center px-4"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={[
          "pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-md",
          toneClass,
          isLeaving ? "source-activity-notice-exit" : "source-activity-notice-enter",
        ].join(" ")}
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          <StatusGlyph tone={tone} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] font-semibold leading-5 text-[#101828]">{title}</p>
          <p className="m-0 mt-0.5 text-[12px] font-normal leading-5 text-[#6a7282]">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}
