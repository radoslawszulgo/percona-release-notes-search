import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, UploadResult } from '../services/api.service';

@Component({
  selector: 'app-upload',
  imports: [CommonModule],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class UploadComponent {
  dragging = signal(false);
  uploading = signal(false);
  results = signal<UploadResult[]>([]);
  error = signal('');

  constructor(private api: ApiService) {}

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave() {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      f.name.endsWith('.md'),
    );
    if (files.length) this.upload(files);
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) this.upload(files);
    input.value = '';
  }

  private upload(files: File[]) {
    this.uploading.set(true);
    this.error.set('');
    this.results.set([]);

    this.api.upload(files).subscribe({
      next: (res) => {
        this.results.set(res.results);
        this.uploading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Upload failed. Is the server running?');
        this.uploading.set(false);
      },
    });
  }
}
