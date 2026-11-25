export const environment = {
  // Expo requires direct process.env.EXPO_PUBLIC_* access to inline values.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "",
};
