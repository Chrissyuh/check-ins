import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";

export type AuthSession = Session;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const allowLocalPreview = process.env.EXPO_PUBLIC_ALLOW_LOCAL_PREVIEW !== "false";
export const privacyPolicyUrl =
  process.env.EXPO_PUBLIC_PRIVACY_URL ??
  "https://github.com/Chrissyuh/check-ins/blob/main/apps/v2/store/privacy-policy.md";
export const supportUrl =
  process.env.EXPO_PUBLIC_SUPPORT_URL ?? "https://github.com/Chrissyuh/check-ins/issues";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
