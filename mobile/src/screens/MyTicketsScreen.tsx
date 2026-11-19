import { useCallback } from "react";
import { Alert, FlatList, Linking, Text, View } from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getMyTickets, getTicketPdfUrl, getTicketQrImageUrl } from "../api/tickets";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { TicketCard } from "../components/TicketCard";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles, theme } from "../theme";
import type { RootTabParamList, TicketsStackParamList } from "../navigation/types";

type Props = CompositeScreenProps<NativeStackScreenProps<TicketsStackParamList, "TicketList">, BottomTabScreenProps<RootTabParamList, "MyTickets">>;

export function MyTicketsScreen({ navigation }: Props) {
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
          ListHeaderComponent={<View style={{ gap: theme.spacing.sm }}>
            <Text style={sharedStyles.muted}>Signed in as {state.status === "signedIn" ? state.user.email : ""}. Pull down to refresh admission status.</Text>
            <AppButton title="Purchase history" onPress={() => navigation.navigate("OrderHistory")} />
          </View>}
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
