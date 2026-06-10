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
  releaseHighlights: { title: string | null; content: string }[];
  newFeatures: { ticket: string; description: string }[];
  improvements: { ticket: string; description: string }[];
  bugFixes: { ticket: string; description: string }[];
  score?: number;
}

export interface MongoQuery {
  label: string;
  shell: string;
  note?: string;
}

export interface SearchResponse {
  results: ReleaseNote[];
  searchType?: 'text' | 'vector';
  summary?: string;
  summaryError?: string;
  keywords?: string[];
  keywordsError?: string;
  queries?: MongoQuery[];
}

export interface EmbeddingStatus {
  total: number;
  embedded: number;
  missing: number;
  ollamaAvailable: boolean;
}

export interface EmbeddingUpdateResponse {
  updated: number;
  failed: number;
  total: number;
  message?: string;
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

  health(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/api/health`);
  }

  search(query: string, product?: string, type: 'text' | 'vector' = 'text'): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(`${this.base}/api/search`, { query, product, type });
  }

  embeddingStatus(): Observable<EmbeddingStatus> {
    return this.http.get<EmbeddingStatus>(`${this.base}/api/embeddings/status`);
  }

  updateEmbeddings(missingOnly = false): Observable<EmbeddingUpdateResponse> {
    const params = missingOnly ? '?missing=true' : '';
    return this.http.post<EmbeddingUpdateResponse>(`${this.base}/api/embeddings/update${params}`, {});
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
