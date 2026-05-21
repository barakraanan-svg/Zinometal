/**
 * Web Push entrypoint — intentionally a stub for MVP.
 *
 * To implement real Web Push:
 *   1. Generate VAPID keys (`npx web-push generate-vapid-keys`).
 *   2. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in .env.
 *   3. Add a PushSubscription model to prisma/schema.prisma and store browser
 *      subscriptions when the user grants permission in the client.
 *   4. Inside `sendPushNotification`, look up subscriptions for the relevant
 *      user(s) and call `webpush.sendNotification(subscription, payload)`.
 *   5. Add a /sw.js service worker that handles the `push` event and shows a
 *      notification.
 *
 * Until that's done, this function only logs — in-app notifications are still
 * created by `generateServiceNotifications()` and shown in the UI.
 */

export interface PushPayload {
  title: string;
  body: string;
  forkliftId: string;
  type: "UPCOMING" | "DUE" | "OVERDUE";
}

export async function sendPushNotification(payload: PushPayload): Promise<void> {
  // TODO(push): implement real Web Push delivery here.
  if (process.env.NODE_ENV !== "production") {
    console.log("[push:stub]", payload.title, "—", payload.body);
  }
}
