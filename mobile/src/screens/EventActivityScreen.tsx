import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, Text, View } from "react-native";

import { EVENT_ACTIVITY_LIMIT, getEventActivity } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formatDateTime } from "../utils/formatting";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventActivity">;

const activityLabels: Record<string, string> = {
  order_paid: "Order confirmed",
  check_in: "Attendee checked in",
  check_in_reversed: "Check-in reversed",
  staff_revoked: "Staff access revoked",
};

function activityLabel(action: string) {
  return activityLabels[action] ?? action.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function EventActivityScreen({ route }: Props) {
  const { eventId, eventTitle } = route.params;
  const { authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getEventActivity(token, eventId, signal)), [authed, eventId]);
  const resource = useApiResource(load);

  return (
    <Screen>
      {resource.loading ? <LoadingState message="Loading event activity…" /> : resource.error ? (
        <ErrorState title="Couldn't load event activity" message={resource.error} onRetry={resource.retry} />
      ) : (
        <FlatList
          data={resource.data ?? []}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          ListHeaderComponent={<View>
            <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
            <Text style={sharedStyles.muted}>Latest {EVENT_ACTIVITY_LIMIT} actions. Use the website for full history and filters.</Text>
          </View>}
          ListEmptyComponent={<EmptyState title="No activity yet" message="Event changes, orders and admissions will appear here." />}
          renderItem={({ item }) => (
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.title}>{activityLabel(item.action)}</Text>
              {item.details ? <Text style={sharedStyles.body}>{item.details}</Text> : null}
              <Text style={sharedStyles.muted}>{item.actor ?? "System"} · {formatDateTime(item.timestamp)}</Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
