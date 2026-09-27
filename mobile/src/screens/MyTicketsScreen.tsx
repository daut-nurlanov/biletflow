import { FlatList } from "react-native";

import { getMyTickets } from "../api/tickets";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { TicketCard } from "../components/TicketCard";
import { environment } from "../config/environment";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles } from "../theme";

const loadTickets = (signal: AbortSignal) =>
  getMyTickets(environment.developmentAttendeeId, signal);

export function MyTicketsScreen() {
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadTickets);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading your tickets…" /> : error ? (
        <ErrorState title="Couldn't load your tickets" message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(ticket) => ticket.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => <TicketCard ticket={item} />}
          ListEmptyComponent={
            <EmptyState title="No tickets yet" message="You don't have any tickets yet." />
          }
        />
      )}
    </Screen>
  );
}
