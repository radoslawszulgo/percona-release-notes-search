import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReleaseNote {
  _id: string;
  filename: string;
  product: string;
  version: string;
  uploadedAt: string;
  releaseHighlights: string[];
  newFeatures: { ticket: string; description: string }[];
  improvements: { ticket: string; description: string }[];
  bugFixes: { ticket: string; description: string }[];
  score?: number;
}

export interface SearchResponse {
  results: ReleaseNote[];
}

export interface UploadResult {
  filename: string;
  product?: string;
  version?: string;
  status?: string;
  error?: string;
}

export interface UploadResponse {
  results: UploadResult[];
}

export interface DocumentsResponse {
  documents: ReleaseNote[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  search(query: string, product?: string): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(`${this.base}/api/search`, { query, product });
  }

  upload(files: File[]): Observable<UploadResponse> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return this.http.post<UploadResponse>(`${this.base}/api/upload`, form);
  }

  listDocuments(): Observable<DocumentsResponse> {
    return this.http.get<DocumentsResponse>(`${this.base}/api/documents`);
  }

  deleteDocument(id: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`${this.base}/api/documents/${id}`);
  }
}
