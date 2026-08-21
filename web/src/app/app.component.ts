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

  constructor(private scans: ScanService) {}

  // packages that have at least one CVE finding
  vulnerableDeps = computed<Dependency[]>(() => {
    const s = this.scan();
    if (!s) return [];
    return s.dependencies
      .filter((d) => this.cveFindings(d).length > 0)
      .sort((a, b) => this.worstScore(b) - this.worstScore(a));
  });

  // packages flagged by heuristics (suspicious/caution), no matter CVE status
  suspiciousDeps = computed<Dependency[]>(() => {
    const s = this.scan();
    if (!s) return [];
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
      if (!this.sourceName()) this.sourceName.set(file.name.replace(/\.json$/, ''));
    };
    reader.readAsText(file);
  }

  submit(): void {
    this.error.set('');
    this.scan.set(null);
    const raw = this.lockfileText().trim();
    if (!raw) {
      this.error.set('Paste a package-lock.json (or package.json) or choose a file first.');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.error.set('That is not valid JSON. Make sure it is a package-lock.json or package.json.');
      return;
    }
    this.loading.set(true);
    // 1) create the scan (returns immediately with status "processing")
    this.scans.createScan(parsed, this.sourceName() || undefined).subscribe({
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

  trackByDep = (_: number, d: Dependency) => d.id;
  trackByFinding = (_: number, f: Finding) => f.id;
}
