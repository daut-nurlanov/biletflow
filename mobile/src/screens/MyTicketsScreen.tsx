import { useCallback } from "react";
import { Alert, FlatList, Linking, Text } from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

import { getMyTickets, getTicketPdfUrl, getTicketQrImageUrl } from "../api/tickets";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { TicketCard } from "../components/TicketCard";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles } from "../theme";
import type { RootTabParamList } from "../navigation/types";

export function MyTicketsScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "MyTickets">) {
  const { authed, state } = useSession();
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
          ListHeaderComponent={<Text style={sharedStyles.muted}>Signed in as {state.status === "signedIn" ? state.user.email : ""}. Tickets bought here or on the website appear for this account. Pull down to refresh admission status.</Text>}
          renderItem={({ item }) => (
            <TicketCard ticket={item} qrImageSource={{ uri: getTicketQrImageUrl(item.id) }}
              onSupport={() => navigation.navigate("SupportTab", { screen: "SupportNew", params: { ticketId: item.id } })}
              onPdf={() => { void Linking.openURL(getTicketPdfUrl(item.id))
                .catch(() => Alert.alert("Couldn't open PDF", "Check your connection and try again.")); }} />
          )}
          ListEmptyComponent={
            <EmptyState title="No tickets yet" message="You don't have any tickets yet." />
          }
        />
      )}
    </Screen>
  );
}
