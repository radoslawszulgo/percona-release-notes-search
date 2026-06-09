import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ApiService } from './services/api.service';

export type ServerStatus = 'checking' | 'online' | 'offline';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  serverStatus = signal<ServerStatus>('checking');
  private statusSub?: Subscription;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.statusSub = timer(0, 15000).pipe(
      switchMap(() => this.api.health().pipe(catchError(() => of(null))))
    ).subscribe(res => {
      this.serverStatus.set(res?.status === 'ok' ? 'online' : 'offline');
    });
  }

  ngOnDestroy() {
    this.statusSub?.unsubscribe();
  }
}
