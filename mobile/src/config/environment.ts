export const environment = {
  // Expo requires direct process.env.EXPO_PUBLIC_* access to inline values.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "",
  // Week 7 only: Dana's existing attendee record in docs/walkthrough_demo.sql.
  // TODO: supply the attendee ID from authenticated user state instead.
  developmentAttendeeId:
    process.env.EXPO_PUBLIC_DEV_ATTENDEE_ID?.trim() ||
    "22222222-2222-2222-2222-222222222222",
};
