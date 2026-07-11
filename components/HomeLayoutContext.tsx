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
  fetchPipelinePanelOpen: boolean;
  setFetchPipelinePanelOpen: Dispatch<SetStateAction<boolean>>;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
};

const HomeLayoutContext = createContext<HomeLayoutContextValue | null>(null);

export function HomeLayoutProvider({ children }: { children: ReactNode }) {
  const [isSourcesListCollapsed, setIsSourcesListCollapsed] = useState(true);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [fetchPipelinePanelOpen, setFetchPipelinePanelOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const onCollapseAnalysisRef = useRef<(() => void) | null>(null);

  const toggleSourcesListCollapsed = useCallback(() => {
    setIsSourcesListCollapsed((v) => !v);
  }, []);

  const openLoginModal = useCallback(() => {
    setIsLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
  }, []);

  const value = useMemo<HomeLayoutContextValue>(
    () => ({
      isSourcesListCollapsed,
      setIsSourcesListCollapsed,
      toggleSourcesListCollapsed,
      analysisPanelOpen,
      setAnalysisPanelOpen,
      onCollapseAnalysisRef,
      fetchPipelinePanelOpen,
      setFetchPipelinePanelOpen,
      isLoginModalOpen,
      openLoginModal,
      closeLoginModal,
    }),
    [
      isSourcesListCollapsed,
      toggleSourcesListCollapsed,
      analysisPanelOpen,
      fetchPipelinePanelOpen,
      isLoginModalOpen,
      openLoginModal,
      closeLoginModal,
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
