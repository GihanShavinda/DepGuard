// Shapes returned by the DepGuard Laravel API.

export interface Finding {
  id: number;
  dependency_id: number;
  type: 'cve' | 'malicious_heuristic';
  vuln_id: string | null;
  severity: string | null;      // Critical | High | Moderate | Low | Unknown
  cvss_score: number | null;
  title: string | null;
  fixed_version: string | null;
  url: string | null;
}

export interface Dependency {
  id: number;
  scan_id: number;
  name: string;
  version: string;
  is_direct: boolean;
  trust_score: number | null;   // 0-100, higher = safer
  trust_level: 'trusted' | 'caution' | 'suspicious' | null;
  findings: Finding[];
}

export interface SummaryCounts {
  total: number;
  direct: number;
  vulnerable?: number;          // packages with a CVE
  suspicious?: number;          // packages with low trust score
  cve_findings?: number;
  heuristic_findings?: number;
  osv_checked?: boolean;
}

export interface Scan {
  id: number;
  ecosystem: string;
  source_name: string | null;
  status: 'pending' | 'processing' | 'done' | 'failed';
  summary_counts: SummaryCounts | null;
  dependencies: Dependency[];
  created_at: string;
  updated_at: string;
}
