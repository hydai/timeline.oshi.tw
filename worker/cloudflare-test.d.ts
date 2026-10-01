/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    // All Worker bindings from wrangler.jsonc are available on `env` in tests.
    interface Env {
      YOUTUBE_API_KEY: string;
      MANUAL_TRIGGER_TOKEN?: string;
      // Injected by vitest.config.ts for the migration setup file.
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
