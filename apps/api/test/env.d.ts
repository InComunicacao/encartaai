// Tipos do `env` dos testes: os mesmos bindings do Worker + as migrações.
import type { Env as EnvWorker } from '../src/index';
declare global {
  namespace Cloudflare {
    interface Env extends EnvWorker { TEST_MIGRATIONS: import('cloudflare:test').D1Migration[] }
  }
}
export {};
