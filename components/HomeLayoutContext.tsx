"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type HomeLayoutContextValue = {
  isSourcesListCollapsed: boolean;
  setIsSourcesListCollapsed: Dispatch<SetStateAction<boolean>>;
  toggleSourcesListCollapsed: () => void;
  analysisPanelOpen: boolean;
  setAnalysisPanelOpen: (v: boolean) => void;
  onCollapseAnalysisRef: React.MutableRefObject<(() => void) | null>;
};

const HomeLayoutContext = createContext<HomeLayoutContextValue | null>(null);

export function HomeLayoutProvider({ children }: { children: ReactNode }) {
  const [isSourcesListCollapsed, setIsSourcesListCollapsed] = useState(true);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const onCollapseAnalysisRef = useRef<(() => void) | null>(null);

  const toggleSourcesListCollapsed = useCallback(() => {
    setIsSourcesListCollapsed((v) => !v);
  }, []);

  const value = useMemo<HomeLayoutContextValue>(
    () => ({
      isSourcesListCollapsed,
      setIsSourcesListCollapsed,
      toggleSourcesListCollapsed,
      analysisPanelOpen,
      setAnalysisPanelOpen,
      onCollapseAnalysisRef,
    }),
    [
      isSourcesListCollapsed,
      toggleSourcesListCollapsed,
      analysisPanelOpen,
    ]
  );

  return (
    <HomeLayoutContext.Provider value={value}>
      {children}
    </HomeLayoutContext.Provider>
  );
}

export function useOptionalHomeLayout(): HomeLayoutContextValue | null {
  return useContext(HomeLayoutContext);
}
