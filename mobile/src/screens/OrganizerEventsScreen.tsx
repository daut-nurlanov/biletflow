import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList } from "react-native";

import { getOrganizerEvents } from "../api/events";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EventCard } from "../components/EventCard";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { environment } from "../config/environment";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";

type Props = NativeStackScreenProps<OrganizerStackParamList, "OrganizerEvents">;

// Defined once at module level so useApiResource receives a stable loader.
const loadOrganizerEvents = (signal: AbortSignal) =>
  getOrganizerEvents(environment.developmentOrganizerId, signal);

export function OrganizerEventsScreen({ navigation }: Props) {
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadOrganizerEvents);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading your events…" /> : error ? (
        <ErrorState title="Couldn't load your events" message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={data}
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
