import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, timer, switchMap, takeWhile, filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { Scan } from '../models/scan.model';

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Create a scan. Returns immediately with status "processing" (HTTP 202). */
  createScan(lockfile: unknown, sourceName?: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.base}/scans`, {
      lockfile,
      source_name: sourceName ?? null,
    });
  }

  getScan(id: number): Observable<Scan> {
    return this.http.get<Scan>(`${this.base}/scans/${id}`);
  }

  /**
   * Poll a scan every `intervalMs` until it's done or failed.
   * Emits each status update; completes when terminal.
   */
  pollScan(id: number, intervalMs = 2000): Observable<Scan> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.getScan(id)),
      // keep emitting while still processing; include the terminal emission
      takeWhile((s) => s.status === 'processing' || s.status === 'pending', true),
      filter((s) => !!s),
    );
  }
}
