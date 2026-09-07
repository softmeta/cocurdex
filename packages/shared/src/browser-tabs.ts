export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  streaming?: boolean;
  previewError?: string;
  error: string | null;
}

export interface BrowserTabsSnapshot {
  tabs: BrowserTab[];
  activeId: string | null;
}
