import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, timer, switchMap, takeWhile, filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { Scan } from '../models/scan.model';

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Create a scan from raw manifest text + optional filename. Returns 202. */
  createScan(content: string, filename?: string, sourceName?: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.base}/scans`, {
      content,
      filename: filename ?? null,
      source_name: sourceName ?? null,
    });
  }

  getScan(id: number): Observable<Scan> {
    return this.http.get<Scan>(`${this.base}/scans/${id}`);
  }

  pollScan(id: number, intervalMs = 2000): Observable<Scan> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.getScan(id)),
      takeWhile((s) => s.status === 'processing' || s.status === 'pending', true),
      filter((s) => !!s),
    );
  }
}
