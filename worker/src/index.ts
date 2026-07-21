import type { Env } from "./types";

export default {
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Dispatch wired up in Task 12.
  },
};
