import { StyleSheet } from "react-native";

export const theme = {
  colors: {
    background: "#F5F7FA",
    surface: "#FFFFFF",
    text: "#172B3A",
    muted: "#526575",
    primary: "#176052",
    border: "#DCE3E8",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12 },
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
  title: { fontSize: theme.fontSize.title, fontWeight: "600", color: theme.colors.text },
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
});
