import { useCallback } from "react";
import { Text, View } from "react-native";

import { getAttendanceStats } from "../api/checkin";
import { useSession } from "../auth/SessionContext";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles } from "../theme";
import { AppButton } from "./AppButton";

export function AttendanceSummary({ eventId }: { eventId: string }) {
  const { authed } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getAttendanceStats(token, eventId, signal)), [authed, eventId],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(load, 15_000);
  return (
    <View style={sharedStyles.card}>
      <Text accessibilityRole="header" style={sharedStyles.title}>Attendance</Text>
      {loading ? <Text style={sharedStyles.muted}>Loading attendance…</Text> : error ? (
        <Text accessibilityRole="alert" style={sharedStyles.body}>{error}</Text>
      ) : data ? (
        <Text style={sharedStyles.body} accessibilityLiveRegion="polite">
          {data.checked_in} checked in · {data.not_arrived} not arrived · {data.registered} registered
        </Text>
      ) : null}
      <Text style={sharedStyles.muted}>Updates every 15 seconds while this screen is open.</Text>
      <AppButton title={refreshing ? "Refreshing attendance…" : error ? "Retry attendance" : "Refresh attendance"}
        onPress={error ? retry : refresh} disabled={loading || refreshing} />
    </View>
  );
}
