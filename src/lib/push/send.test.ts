import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `docs/I18N.md`: `sendPushToUser` resolves the *recipient's* own
 * `profiles.locale` (falling back to Turkish when unset) and renders the
 * payload from message keys — never from a caller-supplied literal string,
 * and never from the actor's own request locale. These tests record the
 * exact JSON body `webpush.sendNotification` is called with and assert it
 * matches the recipient's locale, not the default/caller's.
 */

const sendNotificationMock = vi.fn().mockResolvedValue(undefined);
class FakeWebPushError extends Error {
  statusCode: number;
  constructor(statusCode: number) {
    super("push failed");
    this.statusCode = statusCode;
  }
}
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
    WebPushError: FakeWebPushError,
  },
}));

const listPushSubscriptionsForUserMock = vi.fn();
vi.mock("./subscriptions", () => ({
  listPushSubscriptionsForUser: (...args: unknown[]) => listPushSubscriptionsForUserMock(...args),
}));

const getProfileByIdMock = vi.fn();
vi.mock("@/lib/db/profiles", () => ({
  getProfileById: (...args: unknown[]) => getProfileByIdMock(...args),
}));

const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ delete: () => ({ eq: deleteEqMock }) }),
  }),
}));

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
process.env.VAPID_PRIVATE_KEY = "priv";
process.env.VAPID_SUBJECT = "mailto:test@example.com";

const { sendPushToUser, notifyDuetPush } = await import("./send");

const SUBSCRIPTION = { id: "sub-1", endpoint: "https://push.example.com/1", p256dh: "p", auth: "a" };

beforeEach(() => {
  sendNotificationMock.mockClear();
  listPushSubscriptionsForUserMock.mockReset().mockResolvedValue([SUBSCRIPTION]);
  getProfileByIdMock.mockReset();
});

function sentPayload(): { title: string; body?: string; url?: string; tag?: string } {
  expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  const [, body] = sendNotificationMock.mock.calls[0] as [unknown, string];
  return JSON.parse(body);
}

describe("sendPushToUser — recipient-locale resolution", () => {
  it("renders in Turkish for a recipient whose profile locale is tr", async () => {
    getProfileByIdMock.mockResolvedValue({ locale: "tr" });

    await sendPushToUser("user-1", {
      titleKey: "DuetRecordActions.newDuetRequestTitle",
      bodyKey: "DuetRecordActions.newDuetRequestBody",
      bodyParams: { duet: "duet", wave: "wave" },
    });

    expect(sentPayload()).toMatchObject({
      title: "Yeni duet isteği",
      body: "Wave içeriğinizi kullanarak bir Duet oluşturmak istiyor.",
    });
  });

  it("renders in English for a recipient whose profile locale is en", async () => {
    getProfileByIdMock.mockResolvedValue({ locale: "en" });

    await sendPushToUser("user-2", {
      titleKey: "DuetRecordActions.newDuetRequestTitle",
      bodyKey: "DuetRecordActions.newDuetRequestBody",
      bodyParams: { duet: "duet", wave: "wave" },
    });

    expect(sentPayload()).toMatchObject({
      title: "New duet request",
      body: "Wants to create a Duet using your Wave.",
    });
  });

  it("falls back to Turkish, not English, when the recipient has no locale preference on file", async () => {
    getProfileByIdMock.mockResolvedValue({ locale: null });

    await sendPushToUser("user-3", { titleKey: "DuetRecordActions.newDuetRequestTitle" });

    expect(sentPayload().title).toBe("Yeni duet isteği");
  });

  it("falls back to Turkish when the profile lookup itself fails", async () => {
    getProfileByIdMock.mockRejectedValue(new Error("db unreachable"));

    await sendPushToUser("user-4", { titleKey: "DuetRecordActions.newDuetRequestTitle" });

    expect(sentPayload().title).toBe("Yeni duet isteği");
  });
});

describe("notifyDuetPush — respects the recipient's own locale, not the actor's", () => {
  it("passes titleKey/bodyKey through untranslated to sendPushToUser, resolved for the recipient", async () => {
    getProfileByIdMock.mockResolvedValue({ locale: "tr", notificationPreferences: { duet: true } });

    await notifyDuetPush({} as never, {
      recipientId: "user-5",
      titleKey: "DuetRecordActions.openCallAnsweredTitle",
      bodyKey: "DuetRecordActions.openCallAnsweredBody",
      bodyParams: { duet: "duet" },
    });

    expect(sentPayload()).toMatchObject({
      title: "Açık çağrınız yanıtlandı",
      body: "Biri açık Duet çağrınıza karşılık kayıt yaptı.",
    });
  });

  it("never sends a push when the recipient has turned off duet notifications", async () => {
    getProfileByIdMock.mockResolvedValue({ locale: "tr", notificationPreferences: { duet: false } });

    await notifyDuetPush({} as never, {
      recipientId: "user-6",
      titleKey: "DuetRecordActions.openCallAnsweredTitle",
    });

    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
