declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_ALLOW_LOCAL_PREVIEW?: string;
    EXPO_PUBLIC_PRIVACY_URL?: string;
    EXPO_PUBLIC_SUPPORT_URL?: string;
  }
}
