import { existsSync } from 'node:fs';

export function loadEnv() {
  const path = '.env';
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
    } catch {
      // ignore malformed .env
    }
  }
}
