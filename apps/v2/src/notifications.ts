import { Platform } from "react-native";

type ExpoNotifications = typeof import("expo-notifications");

let notificationsPromise: Promise<ExpoNotifications> | null = null;

async function getNotifications() {
  if (Platform.OS === "web") return null;

  notificationsPromise ??= import("expo-notifications").then((notifications) => {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return notifications;
  });

  return notificationsPromise;
}

export async function requestNotificationPermission() {
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("check-ins", {
      name: "Check-ins",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleLocalReminder(title: string, body: string) {
  if (Platform.OS === "web") {
    return null;
  }

  const Notifications = await getNotifications();
  if (!Notifications) return null;

  const granted = await requestNotificationPermission();
  if (!granted) return null;

  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

export function reminderHonestyText() {
  if (Platform.OS === "web") {
    return "Web reminders are honest: they only run while the page is open until a future service-worker/PWA layer is added.";
  }

  return "Mobile reminders use local notifications after permission is granted. Push notifications are intentionally not part of this MVP.";
}
