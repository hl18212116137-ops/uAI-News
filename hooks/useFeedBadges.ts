"use client";
import { useCallback, useRef, useState } from "react";
import type { NewsItem } from "@/lib/types";

type NewBadgeCommitMode = "replace" | "merge";

function collectNewBadgePostIds(
  nextPosts: NewsItem[],
  previousIds: ReadonlySet<string>,
  startedAtMs: number
): Set<string> {
  const out = new Set<string>();
  for (const post of nextPosts) {
    if (previousIds.has(post.id)) continue;
    const createdAtMs = new Date(post.createdAt).getTime();
    if (Number.isFinite(createdAtMs) && createdAtMs >= startedAtMs) {
      out.add(post.id);
    }
  }
  return out;
}

function commitPostIdSetByMode(
  current: Set<string>,
  incoming: ReadonlySet<string>,
  mode: NewBadgeCommitMode
): Set<string> {
  if (mode === "replace") return new Set(incoming);
  if (incoming.size === 0) return current;
  const next = new Set(current);
  for (const id of incoming) next.add(id);
  return next;
}

type NewBadgeCollectionWindow = {
  startedAtMs: number;
  baselinePostIds: Set<string>;
};

export function useFeedBadges() {
  const [newBadgePostIds, setNewBadgePostIds] = useState<Set<string>>(() => new Set());
  const [newBadgeSortPostIds, setNewBadgeSortPostIds] = useState<Set<string>>(() => new Set());
  const refreshStartedAtRef = useRef<number | null>(null);
  const refreshBaselinePostIdsRef = useRef<Set<string>>(new Set());
  const newBadgeCollectionWindowRef = useRef<NewBadgeCollectionWindow | null>(null);
  const newBadgeCommitModeRef = useRef<NewBadgeCommitMode>("replace");
  const clearRefreshNewBadgeContext = useCallback((clearCollectionWindow = true) => {
    refreshStartedAtRef.current = null;
    refreshBaselinePostIdsRef.current = new Set();
    newBadgeCommitModeRef.current = "replace";
    if (clearCollectionWindow) {
      newBadgeCollectionWindowRef.current = null;
    }
  }, []);

  const beginNewBadgeCollection = useCallback(
    (startedAtMs: number, baselinePostIds: Set<string>, mode: NewBadgeCommitMode) => {
      refreshStartedAtRef.current = startedAtMs;
      refreshBaselinePostIdsRef.current = baselinePostIds;
      newBadgeCommitModeRef.current = mode;
      newBadgeCollectionWindowRef.current = { startedAtMs, baselinePostIds };
    },
    []
  );

  const collectNewBadgesForLoadedPosts = useCallback((loadedPosts: NewsItem[]) => {
    const collectionWindow = newBadgeCollectionWindowRef.current;
    if (!collectionWindow || loadedPosts.length === 0) return;

    const collected = collectNewBadgePostIds(
      loadedPosts,
      collectionWindow.baselinePostIds,
      collectionWindow.startedAtMs
    );
    if (collected.size === 0) return;

    setNewBadgePostIds((current) => commitPostIdSetByMode(current, collected, "merge"));
    setNewBadgeSortPostIds((current) => commitPostIdSetByMode(current, collected, "merge"));
  }, []);

  const commitNewBadgesFromPosts = useCallback((nextPosts: NewsItem[]) => {
    const startedAtMs = refreshStartedAtRef.current;
    if (startedAtMs == null) return;
    const baselinePostIds = refreshBaselinePostIdsRef.current;

    const collected = collectNewBadgePostIds(
      nextPosts,
      baselinePostIds,
      startedAtMs
    );
    newBadgeCollectionWindowRef.current = { startedAtMs, baselinePostIds };
    const mode = newBadgeCommitModeRef.current;
    setNewBadgePostIds((current) => commitPostIdSetByMode(current, collected, mode));
    setNewBadgeSortPostIds((current) => commitPostIdSetByMode(current, collected, mode));
    clearRefreshNewBadgeContext(false);
  }, [clearRefreshNewBadgeContext]);

  const dismissNewBadge = useCallback((postId: string) => {
    setNewBadgePostIds((current) => {
      if (!current.has(postId)) return current;
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
  }, []);

  return { newBadgePostIds, newBadgeSortPostIds, setNewBadgePostIds, refreshStartedAtRef,
    newBadgeCollectionWindowRef, clearRefreshNewBadgeContext, beginNewBadgeCollection,
    collectNewBadgesForLoadedPosts, commitNewBadgesFromPosts, dismissNewBadge };
}
