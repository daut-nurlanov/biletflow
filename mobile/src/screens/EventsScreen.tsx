import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { getEvents } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { AppButton } from "../components/AppButton";
import { CampaignEntry } from "../components/CampaignEntry";
import { DiscoveryHeader } from "../components/DiscoveryHeader";
import { ErrorState } from "../components/ErrorState";
import { EventCard } from "../components/EventCard";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { EventsStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<EventsStackParamList, "Events">;

export function EventsScreen({ navigation }: Props) {
  const { t: localize } = useLocale();
  const { authed } = useSession();
  const [query, setQuery] = useState("");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const loadEvents = useCallback(
    (signal: AbortSignal) => authed((token) => getEvents(signal, token)), [authed],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadEvents);
  const term = query.trim().toLocaleLowerCase();
  const results = data?.filter((event) =>
    [event.title, event.venue_name, event.venue_address, event.category]
      .some((value) => value?.toLocaleLowerCase().includes(term)),
  );

  return (
    <Screen>
      {loading ? <LoadingState message={localize("Loading events…")} /> : error ? (
        <ErrorState title={localize("Couldn't load events")} message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={results ?? []}
          keyExtractor={(event) => event.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<View style={{ gap: theme.spacing.md }}>
            <DiscoveryHeader query={query} onSearch={setQuery} />
            {campaignOpen ? <View style={{ gap: theme.spacing.sm }}>
              <CampaignEntry onOpen={(eventId, campaignToken) => navigation.navigate("Checkout", { eventId, campaignToken })} />
              <AppButton title={localize("Hide campaign link form")} variant="secondary" onPress={() => setCampaignOpen(false)} />
            </View> : <AppButton title={localize("Have a campaign link?")} variant="secondary" onPress={() => setCampaignOpen(true)} />}
            <Text accessibilityRole="header" style={sharedStyles.title}>{localize("Events")}</Text>
          </View>}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              showCover
              onPress={() => navigation.navigate("EventDetails", { eventId: item.id })}
            />
          )}
          ListEmptyComponent={
            <EmptyState title={term ? localize("No matching events") : localize("No events yet")}
              message={term ? localize("Try another event, venue, or category.") : localize("Check back soon, or pull down to refresh.")} />
          }
        />
      )}
    </Screen>
  );
}
