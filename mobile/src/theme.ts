import { StyleSheet } from "react-native";

export const theme = {
  colors: {
    background: "#F7F7FB",
    surface: "#FFFFFF",
    text: "#15152A",
    muted: "#56566E",
    primary: "#5139CD",
    border: "#E2E1EB",
    fieldBorder: "#B6B3C8",
    accentSoft: "#ECE8FF",
    accentInk: "#3E26A8",
    night: "#1B1641",
    danger: "#9C263A",
    dangerSoft: "#FCECF0",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 10, md: 18, lg: 24 },
  fontSize: { small: 14, body: 16, title: 20, heading: 28 },
};

export const sharedStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  heading: { fontSize: theme.fontSize.heading, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.7 },
  title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.25 },
  body: { fontSize: theme.fontSize.body, color: theme.colors.text, lineHeight: 24 },
  muted: { fontSize: theme.fontSize.small, color: theme.colors.muted, lineHeight: 22 },
  listContent: { flexGrow: 1, padding: theme.spacing.md, gap: theme.spacing.md },
  state: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  centeredText: { textAlign: "center" },
  accentCard: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentSoft },
});
