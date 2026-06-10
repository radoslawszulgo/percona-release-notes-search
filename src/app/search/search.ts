import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService, MongoQuery, ReleaseNote } from '../services/api.service';

const PRODUCTS = [
  'Percona Server for MongoDB',
  'Percona Backup for MongoDB',
  'Percona Operator for MongoDB',
  'Percona ClusterSync for MongoDB',
];

@Component({
  selector: 'app-search',
  imports: [FormsModule, CommonModule],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class SearchComponent {
  query = '';
  selectedProduct = '';
  searchType: 'text' | 'vector' = 'text';
  products = PRODUCTS;

  results = signal<ReleaseNote[]>([]);
  loading = signal(false);
  error = signal('');
  searched = signal(false);
  activeSearchType = signal<'text' | 'vector'>('text');
  summary = signal<string | null>(null);
  summaryError = signal<string | null>(null);
  keywords = signal<string[]>([]);
  keywordsError = signal<string | null>(null);
  queries = signal<MongoQuery[]>([]);
  queriesOpen = signal(false);
  copiedIndex = signal<number | null>(null);

  activeQuery = signal('');

  constructor(private api: ApiService, private sanitizer: DomSanitizer) {}

  highlight(text: string): SafeHtml {
    if (!this.activeQuery().trim()) return text;
    const kw = this.keywords();
    const terms = (kw.length ? kw : this.activeQuery().trim().split(/\s+/))
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);
    const pattern = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi');
    const highlighted = text.replace(pattern, '<mark>$1</mark>');
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  search() {
    if (!this.query.trim()) return;
    this.loading.set(true);
    this.error.set('');
    this.searched.set(true);
    this.summary.set(null);
    this.summaryError.set(null);
    this.keywords.set([]);
    this.keywordsError.set(null);
    this.queries.set([]);
    this.copiedIndex.set(null);
    this.activeQuery.set('');

    this.api.search(this.query, this.selectedProduct || undefined, this.searchType).subscribe({
      next: (res) => {
        this.results.set(res.results);
        this.activeSearchType.set(res.searchType ?? this.searchType);
        this.summary.set(res.summary ?? null);
        this.summaryError.set(res.summaryError ?? null);
        this.keywords.set(res.keywords ?? []);
        this.keywordsError.set(res.keywordsError ?? null);
        this.queries.set(res.queries ?? []);
        this.activeQuery.set(this.query);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Search failed. Is the server running?');
        this.loading.set(false);
      },
    });
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') this.search();
  }

  expandedId = signal<string | null>(null);

  toggle(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  toggleQueries() {
    this.queriesOpen.set(!this.queriesOpen());
  }

  copyQuery(index: number) {
    const q = this.queries()[index];
    if (!q) return;
    navigator.clipboard.writeText(q.shell).then(() => {
      this.copiedIndex.set(index);
      setTimeout(() => {
        if (this.copiedIndex() === index) this.copiedIndex.set(null);
      }, 2000);
    });
  }
}
