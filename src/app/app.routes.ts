import { Routes } from '@angular/router';
import { SearchComponent } from './search/search';
import { UploadComponent } from './upload/upload';

export const routes: Routes = [
  { path: '', redirectTo: 'search', pathMatch: 'full' },
  { path: 'search', component: SearchComponent },
  { path: 'upload', component: UploadComponent },
];
