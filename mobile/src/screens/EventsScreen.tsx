import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList } from "react-native";

import { getEvents } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { CampaignEntry } from "../components/CampaignEntry";
import { ErrorState } from "../components/ErrorState";
import { EventCard } from "../components/EventCard";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { EventsStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";

type Props = NativeStackScreenProps<EventsStackParamList, "Events">;

export function EventsScreen({ navigation }: Props) {
  const { authed } = useSession();
  const loadEvents = useCallback(
    (signal: AbortSignal) => authed((token) => getEvents(signal, token)), [authed],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadEvents);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading events…" /> : error ? (
        <ErrorState title="Couldn't load events" message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(event) => event.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          ListHeaderComponent={<CampaignEntry onOpen={(eventId, campaignToken) => navigation.navigate("Checkout", { eventId, campaignToken })} />}
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
