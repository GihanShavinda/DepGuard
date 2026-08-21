import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScanService } from './services/scan.service';
import { Dependency, Finding, Scan } from './models/scan.model';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  lockfileText = signal<string>('');
  sourceName = signal<string>('');
  fileName = signal<string>('');

  loading = signal<boolean>(false);
  processing = signal<boolean>(false);
  error = signal<string>('');
  scan = signal<Scan | null>(null);

  // dashboard controls
  severityFilter = signal<string>('all');   // all|critical|high|moderate|low
  typeFilter = signal<string>('all');       // all|cve|heuristic

  constructor(private scans: ScanService) {}

  // ecosystem label for display
  ecosystemLabel = computed<string>(() => {
    const s = this.scan();
    if (!s) return '';
    const map: Record<string, string> = {
      npm: 'npm',
      Packagist: 'PHP / Composer',
      PyPI: 'Python / PyPI',
      RubyGems: 'Ruby / RubyGems',
      Go: 'Go',
      'crates.io': 'Rust / crates.io',
    };
    return map[s.ecosystem] ?? s.ecosystem;
  });

  // severity breakdown for the summary chart (CVE findings)
  severityBreakdown = computed<{ label: string; count: number; cls: string }[]>(() => {
    const s = this.scan();
    if (!s) return [];
    const buckets: Record<string, number> = { Critical: 0, High: 0, Moderate: 0, Low: 0 };
    for (const d of s.dependencies) {
      for (const f of this.cveFindings(d)) {
        const key = this.normalizeSev(f.severity);
        if (key in buckets) buckets[key]++;
      }
    }
    return [
      { label: 'Critical', count: buckets['Critical'], cls: 'sev-critical' },
      { label: 'High', count: buckets['High'], cls: 'sev-high' },
      { label: 'Moderate', count: buckets['Moderate'], cls: 'sev-moderate' },
      { label: 'Low', count: buckets['Low'], cls: 'sev-low' },
    ];
  });

  maxSeverityCount = computed<number>(() =>
    Math.max(1, ...this.severityBreakdown().map((b) => b.count))
  );

  normalizeSev(sev: string | null | undefined): string {
    const v = (sev ?? '').toLowerCase();
    if (v === 'medium') return 'Moderate';
    return v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Unknown';
  }

  // packages that have at least one CVE finding (respecting filters)
  vulnerableDeps = computed<Dependency[]>(() => {
    const s = this.scan();
    if (!s) return [];
    if (this.typeFilter() === 'heuristic') return []; // hide CVE section when filtering to heuristic
    return s.dependencies
      .filter((d) => this.filteredCveFindings(d).length > 0)
      .sort((a, b) => this.worstScore(b) - this.worstScore(a));
  });

  // CVE findings passed through the active severity filter
  filteredCveFindings(d: Dependency): Finding[] {
    const sev = this.severityFilter();
    return this.cveFindings(d).filter(
      (f) => sev === 'all' || this.normalizeSev(f.severity).toLowerCase() === sev
    );
  }

  // packages flagged by heuristics (suspicious/caution), no matter CVE status
  suspiciousDeps = computed<Dependency[]>(() => {
    const s = this.scan();
    if (!s) return [];
    if (this.typeFilter() === 'cve') return []; // hide when filtering to CVE only
    return s.dependencies
      .filter((d) => this.heuristicFindings(d).length > 0)
      .sort((a, b) => (a.trust_score ?? 100) - (b.trust_score ?? 100));
  });

  cleanCount = computed<number>(() => {
    const s = this.scan();
    if (!s) return 0;
    return s.dependencies.filter(
      (d) => this.cveFindings(d).length === 0 && this.heuristicFindings(d).length === 0
    ).length;
  });

  grade = computed<Grade>(() => {
    const s = this.scan();
    if (!s) return 'A';
    const cveFindings = s.dependencies.flatMap((d) => this.cveFindings(d));
    const hasSuspicious = this.suspiciousDeps().some((d) => d.trust_level === 'suspicious');

    if (cveFindings.length === 0 && !hasSuspicious) {
      // caution-only heuristics still nudge below A
      return this.suspiciousDeps().length > 0 ? 'B' : 'A';
    }
    const worst = cveFindings.length
      ? Math.max(...cveFindings.map((f) => this.severityRank(f.severity)))
      : 0;
    if (worst >= 4 || hasSuspicious) return 'F';
    if (worst >= 3) return 'D';
    if (worst >= 2) return 'C';
    return 'B';
  });

  gradeCaption = computed<string>(() => {
    switch (this.grade()) {
      case 'A': return 'No issues detected';
      case 'B': return 'Minor issues — review advised';
      case 'C': return 'Moderate issues present';
      case 'D': return 'High-severity issues present';
      case 'F': return 'Critical risk — act now';
    }
  });

  // --- finding partitioning helpers ---
  cveFindings(d: Dependency): Finding[] {
    return (d.findings ?? []).filter((f) => f.type === 'cve');
  }
  heuristicFindings(d: Dependency): Finding[] {
    return (d.findings ?? []).filter((f) => f.type === 'malicious_heuristic');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      this.lockfileText.set(String(reader.result ?? ''));
      if (!this.sourceName()) this.sourceName.set(file.name.replace(/\.(json|lock|txt|mod|sum)$/, ''));
    };
    reader.readAsText(file);
  }

  submit(): void {
    this.error.set('');
    this.scan.set(null);
    const raw = this.lockfileText().trim();
    if (!raw) {
      this.error.set('Paste a manifest or choose a file first.');
      return;
    }
    this.loading.set(true);
    // Send RAW text — the parser detects the ecosystem. No JSON parse here,
    // since Gemfile.lock / go.mod / Cargo.lock aren't JSON.
    this.scans.createScan(raw, this.fileName() || undefined, this.sourceName() || undefined).subscribe({
      next: (created) => {
        this.loading.set(false);
        this.processing.set(true);
        // 2) poll until the background job finishes
        this.scans.pollScan(created.id).subscribe({
          next: (s) => {
            if (s.status === 'done') {
              this.processing.set(false);
              this.scan.set(s);
            } else if (s.status === 'failed') {
              this.processing.set(false);
              const msg = (s.summary_counts as any)?.error || 'the scan job failed';
              this.error.set(`Scan failed: ${msg}`);
            }
            // still processing -> keep waiting (poll continues)
          },
          error: (err) => {
            this.processing.set(false);
            const detail = err?.error?.error || err?.message || 'lost connection while polling';
            this.error.set(`Scan failed: ${detail}`);
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        const detail = err?.error?.error || err?.error?.message || err?.message || 'Request failed';
        this.error.set(`Scan failed: ${detail}`);
      },
    });
  }

  reset(): void {
    this.scan.set(null);
    this.error.set('');
    this.processing.set(false);
    this.lockfileText.set('');
    this.sourceName.set('');
    this.fileName.set('');
  }

  severityRank(sev: string | null | undefined): number {
    switch ((sev ?? '').toLowerCase()) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'moderate': case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
  severityClass(sev: string | null | undefined): string {
    switch ((sev ?? '').toLowerCase()) {
      case 'critical': return 'sev-critical';
      case 'high': return 'sev-high';
      case 'moderate': case 'medium': return 'sev-moderate';
      case 'low': return 'sev-low';
      default: return 'sev-unknown';
    }
  }
  trustClass(level: string | null | undefined): string {
    switch (level) {
      case 'suspicious': return 'trust-suspicious';
      case 'caution': return 'trust-caution';
      default: return 'trust-ok';
    }
  }
  worstScore(dep: Dependency): number {
    const fs = this.cveFindings(dep);
    if (!fs.length) return 0;
    return Math.max(...fs.map((f) => this.severityRank(f.severity)));
  }

  exportJson(): void {
    const s = this.scan();
    if (!s) return;
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depguard-${s.source_name || 'scan'}-${s.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  copyUpgrade(dep: Dependency, f: Finding): void {
    if (!f.fixed_version) return;
    const eco = this.scan()?.ecosystem;
    let cmd: string;
    switch (eco) {
      case 'Packagist': cmd = `composer require ${dep.name}:^${f.fixed_version}`; break;
      case 'PyPI':      cmd = `pip install ${dep.name}==${f.fixed_version}`; break;
      case 'RubyGems':  cmd = `bundle update ${dep.name} --to ${f.fixed_version}`; break;
      case 'Go':        cmd = `go get ${dep.name}@${f.fixed_version}`; break;
      case 'crates.io': cmd = `cargo update -p ${dep.name} --precise ${f.fixed_version}`; break;
      default:          cmd = `npm install ${dep.name}@${f.fixed_version}`;
    }
    navigator.clipboard?.writeText(cmd);
  }

  setSeverityFilter(v: string): void { this.severityFilter.set(v); }
  setTypeFilter(v: string): void { this.typeFilter.set(v); }

  trackByDep = (_: number, d: Dependency) => d.id;
  trackByFinding = (_: number, f: Finding) => f.id;
}
