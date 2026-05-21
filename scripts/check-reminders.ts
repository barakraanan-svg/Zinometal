/**
 * Standalone CLI that runs the same notification-generation logic the
 * /api/cron/notifications endpoint uses. Suitable for `cron`, `systemd`,
 * or any task scheduler.
 *
 *   npm run cron:check
 */
import { generateServiceNotifications } from "../src/lib/notifications";

async function main() {
  const result = await generateServiceNotifications();
  console.log(
    `[cron:check] created=${result.created}, skipped=${result.skipped}`,
  );
}

main()
  .catch((err) => {
    console.error("[cron:check] failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
