import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getAttendanceStats } from "../api/checkin";
import { useSession } from "../auth/SessionContext";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles, theme } from "../theme";
import { AppButton } from "./AppButton";
import { StatTile } from "./StatTile";
import { useLocale } from "../i18n/LocaleContext";

export function AttendanceSummary({ eventId }: { eventId: string }) {
  const { t: localize } = useLocale();
  const { authed } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getAttendanceStats(token, eventId, signal)), [authed, eventId],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(load, 15_000);
  return (
    <View style={sharedStyles.card}>
      <Text accessibilityRole="header" style={sharedStyles.title}>{localize("Attendance")}</Text>
      {loading ? <Text style={sharedStyles.muted}>{localize("Loading attendance…")}</Text> : error ? (
        <Text accessibilityRole="alert" style={sharedStyles.body}>{error}</Text>
      ) : data ? (
        <View style={styles.counters} accessibilityLiveRegion="polite">
          <StatTile label={localize("Checked in")} value={String(data.checked_in)} />
          <StatTile label={localize("Not arrived")} value={String(data.not_arrived)} />
          <StatTile label={localize("Registered")} value={String(data.registered)} />
        </View>
      ) : null}
      <Text style={sharedStyles.muted}>{localize("Updates every 15 seconds while this screen is open.")}</Text>
      <AppButton variant="secondary" title={refreshing ? localize("Refreshing attendance…") : error ? "Retry attendance" : "Refresh attendance"}
        onPress={error ? retry : refresh} disabled={loading || refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  counters: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
});
