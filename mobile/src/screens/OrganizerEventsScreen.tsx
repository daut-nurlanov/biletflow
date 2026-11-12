import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList } from "react-native";

import { getOrganizerEvents } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EventCard } from "../components/EventCard";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";

type Props = NativeStackScreenProps<OrganizerStackParamList, "OrganizerEvents">;

export function OrganizerEventsScreen({ navigation }: Props) {
  const { authed } = useSession();
  const loadOrganizerEvents = useCallback(
    (signal: AbortSignal) => authed((token) => getOrganizerEvents(token, signal)),
    [authed],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadOrganizerEvents);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading your events…" /> : error ? (
        <ErrorState title="Couldn't load your events" message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(event) => event.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              actionLabel="View dashboard →"
              accessibilityHint="Opens ticket sales for this event"
              onPress={() => navigation.navigate("EventDashboard", { eventId: item.id })}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No events yet"
              message="Events you organize will appear here. Pull down to refresh."
            />
          }
        />
      )}
    </Screen>
  );
}
