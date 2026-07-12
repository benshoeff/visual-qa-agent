export type CrawlJobStatus = "pending" | "running" | "completed" | "failed";

export interface CrawlConfig {
  maxPages: number;
  maxDepth: number;
  sameDomainOnly: boolean;
  excludePatterns: string[];
  waitFor: "networkidle" | "domcontentloaded" | "load";
  viewport: { width: number; height: number };
}

export interface DiscoveredPage {
  url: string;
  name: string;
  depth: number;
  parentUrl?: string;
}

export interface CrawlResult {
  pageName: string;
  url: string;
  success: boolean;
  baselinePath?: string;
  error?: string;
}

export interface CrawlJob {
  id: string;
  status: CrawlJobStatus;
  startUrl: string;
  config: CrawlConfig;
  progress: {
    current: number;
    total: number;
    currentUrl: string;
  };
  discoveredPages: DiscoveredPage[];
  results: CrawlResult[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StartCrawlRequest {
  url: string;
  config?: Partial<CrawlConfig>;
  autoCaptureBaseline?: boolean;
}

export interface ConfirmBaselinesRequest {
  pageNames: string[];
}