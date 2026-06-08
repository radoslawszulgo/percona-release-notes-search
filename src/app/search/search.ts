import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService, ReleaseNote } from '../services/api.service';

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
  products = PRODUCTS;

  results = signal<ReleaseNote[]>([]);
  loading = signal(false);
  error = signal('');
  searched = signal(false);

  constructor(private api: ApiService) {}

  search() {
    if (!this.query.trim()) return;
    this.loading.set(true);
    this.error.set('');
    this.searched.set(true);

    this.api.search(this.query, this.selectedProduct || undefined).subscribe({
      next: (res) => {
        this.results.set(res.results);
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
}
