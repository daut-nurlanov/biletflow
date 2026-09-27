import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList } from "react-native";

import { getEvents } from "../api/events";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EventCard } from "../components/EventCard";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { EventsStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";

type Props = NativeStackScreenProps<EventsStackParamList, "Events">;

export function EventsScreen({ navigation }: Props) {
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(getEvents);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading events…" /> : error ? (
        <ErrorState title="Couldn't load events" message={error} onRetry={retry} />
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
              onPress={() => navigation.navigate("EventDetails", { eventId: item.id })}
            />
          )}
          ListEmptyComponent={
            <EmptyState title="No events yet" message="Check back soon, or pull down to refresh." />
          }
        />
      )}
    </Screen>
  );
}
