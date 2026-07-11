import { defaultAvatarUrlForHandle, resolveSourceAvatarUrl } from "@/lib/source-avatar";
import { formatTypography } from "@/lib/utils";

const GENERIC_SOURCE_DESCRIPTION_FALLBACK = "AI Research · Industry";

const LEGACY_BY_HANDLE: Record<string, string> = {
  karpathy: "LLM Research · AI Engineering",
  sama: "LLM Research · AI Engineering",
  ylecun: "LLM Research · AI Engineering",
  huggingface: "Open-source ML · models & datasets",
  ilyasut: "LLM Research · AI Engineering",
};

const MAX_SOURCE_BIO_TAGS = 3;

function normalizeHandle(handle: string): string {
  return String(handle ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function resolveClientSourceDescription(
  description: string | null | undefined,
  handle: string,
): string {
  const trimmed = String(description ?? "").trim();
  if (trimmed) return trimmed;

  const key = normalizeHandle(handle);
  return (key && LEGACY_BY_HANDLE[key]) || GENERIC_SOURCE_DESCRIPTION_FALLBACK;
}

function splitBioIntoTags(formattedLine: string): string[] {
  const t = formattedLine.trim();
  if (!t) return [];
  if (t.includes("、")) {
    return t
      .split("、")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (/·|路/.test(t)) {
    return t
      .split(/\s*(?:·|路)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (/\|/.test(t)) {
    return t
      .split(/\s*\|\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (/,/.test(t)) {
    return t
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [t];
}

export function sourceBioTagsLine(
  description: string | undefined | null,
  handle: string,
  maxTags: number = MAX_SOURCE_BIO_TAGS,
): string {
  const line = formatTypography(resolveClientSourceDescription(description, handle));
  const tags = splitBioIntoTags(line);
  if (tags.length === 0) return GENERIC_SOURCE_DESCRIPTION_FALLBACK;
  return tags.slice(0, maxTags).join(" · ");
}

export function resolveClientSourceProfile(input: {
  handle: string;
  platform?: string | null;
  avatar?: string | null;
  description?: string | null;
}): {
  avatar: string;
  fallbackAvatar: string;
  description: string;
} {
  const fallbackAvatar = defaultAvatarUrlForHandle(input.handle);
  const avatar = resolveSourceAvatarUrl(
    input.handle,
    input.avatar,
    input.platform ?? "X",
  );

  return {
    avatar,
    fallbackAvatar,
    description: resolveClientSourceDescription(input.description, input.handle),
  };
}
