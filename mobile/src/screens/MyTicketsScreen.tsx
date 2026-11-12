import { useCallback } from "react";
import { FlatList } from "react-native";

import { getMyTickets, getTicketQrImageUrl } from "../api/tickets";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { TicketCard } from "../components/TicketCard";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles } from "../theme";

export function MyTicketsScreen() {
  const { authed } = useSession();
  const loadTickets = useCallback(
    (signal: AbortSignal) => authed((token) => getMyTickets(token, signal)),
    [authed],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadTickets);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading your tickets…" /> : error ? (
        <ErrorState title="Couldn't load your tickets" message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(ticket) => ticket.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <TicketCard ticket={item} qrImageSource={{ uri: getTicketQrImageUrl(item.id) }} />
          )}
          ListEmptyComponent={
            <EmptyState title="No tickets yet" message="You don't have any tickets yet." />
          }
        />
      )}
    </Screen>
  );
}
