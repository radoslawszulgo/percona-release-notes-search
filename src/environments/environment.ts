export const environment = {
  production: true,
  // Empty string = same origin; nginx proxies /api/* to the API container.
  // For local dev without Docker, override in environment.development.ts.
  apiUrl: '',
};
