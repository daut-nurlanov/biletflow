export const environment = {
  // Expo requires direct process.env.EXPO_PUBLIC_* access to inline values.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "",
  // Week 7 only: Dana's existing attendee record in docs/walkthrough_demo.sql.
  // TODO: supply the attendee ID from authenticated user state instead.
  developmentAttendeeId:
    process.env.EXPO_PUBLIC_DEV_ATTENDEE_ID?.trim() ||
    "22222222-2222-2222-2222-222222222222",
  // Organizer screens only: Aigerim's existing organizer record in docs/walkthrough_demo.sql.
  // TODO: supply the organizer ID from authenticated user state instead.
  developmentOrganizerId:
    process.env.EXPO_PUBLIC_DEV_ORGANIZER_ID?.trim() ||
    "11111111-1111-1111-1111-111111111111",
};
