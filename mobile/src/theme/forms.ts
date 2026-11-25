import { StyleSheet } from "react-native";
import { theme } from "../theme";

export const formStyles = StyleSheet.create({
  content: { padding: theme.spacing.md, gap: theme.spacing.md, flexGrow: 1 },
  input: { minHeight: 48, borderWidth: 1, borderColor: theme.colors.fieldBorder, borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface, color: theme.colors.text, paddingHorizontal: theme.spacing.md, fontSize: theme.fontSize.body },
  message: { minHeight: 130, textAlignVertical: "top", padding: theme.spacing.md },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: theme.spacing.sm },
  choice: { minHeight: 48, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, backgroundColor: theme.colors.surface, justifyContent: "center" },
  selected: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.accentSoft },
  disabled: { opacity: 0.5 },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.body },
});
