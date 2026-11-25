import { useCallback, useState } from "react";
import { Alert, Linking, Modal, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getMyTickets, getTicketPdfUrl, getTicketQrImageUrl } from "../api/tickets";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { BrandIcon } from "../components/BrandIcon";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { TicketCard } from "../components/TicketCard";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles, theme } from "../theme";
import { formatDateTime } from "../utils/formatting";
import { eventDisplayStatus } from "../utils/eventTiming";
import type { Ticket } from "../types/ticket";
import type { RootTabParamList, TicketsStackParamList } from "../navigation/types";

type Props = CompositeScreenProps<NativeStackScreenProps<TicketsStackParamList, "TicketList">, BottomTabScreenProps<RootTabParamList, "MyTickets">>;

function admissionStatus(ticket: Ticket) {
  return ticket.status === "valid" && (ticket.event_status === "cancelled" || ticket.event_status === "suspended")
    ? ticket.event_status : ticket.status;
}

function eventEnded(ticket: Ticket, asOf: number) {
  return eventDisplayStatus({
    status: ticket.event_status, start_time: ticket.start_time, end_time: ticket.end_time ?? null,
  }, new Date(asOf)) === "completed";
}

export function MyTicketsScreen({ navigation }: Props) {
  const { authed } = useSession();
  const [openId, setOpenId] = useState<string>();
  const close = () => setOpenId(undefined);
  const loadTickets = useCallback(
    async (signal: AbortSignal) => ({ tickets: await authed((token) => getMyTickets(token, signal)), asOf: Date.now() }),
    [authed],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(loadTickets);
  const asOf = data?.asOf ?? 0;
  const upcoming: Ticket[] = [];
  const historical: Ticket[] = [];
  for (const ticket of data?.tickets ?? []) {
    const group = admissionStatus(ticket) === "valid" && !eventEnded(ticket, asOf)
      ? upcoming : historical;
    group.push(ticket);
  }
  const sections = [
    { title: "Upcoming tickets", data: upcoming },
    { title: "Past and inactive tickets", data: historical },
  ].filter((section) => section.data.length > 0);
  const opened = error ? undefined : data?.tickets.find((ticket) => ticket.id === openId);

  return (
    <Screen>
      {loading ? <LoadingState message="Loading your tickets…" /> : error ? (
        <ErrorState title="Couldn't load your tickets" message={error} onRetry={retry} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(ticket) => ticket.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={<AppButton title="Purchase history" variant="secondary" onPress={() => navigation.navigate("OrderHistory")} />}
          renderSectionHeader={({ section }) => <Text style={sharedStyles.title} accessibilityRole="header">{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={styles.ticket}>
              <View style={styles.ticketHeader}>
                <BrandIcon name={admissionStatus(item) === "valid" ? "qr" : "ticket"} color="#CFC1FF" />
                <Text style={styles.ticketTitle}>{item.event_title}</Text>
              </View>
              <View style={styles.ticketBody}>
                <Text style={sharedStyles.muted}>{formatDateTime(item.start_time)}</Text>
                {item.venue_name ? <Text style={sharedStyles.body}>{item.venue_name}</Text> : null}
                <Text style={sharedStyles.muted}>{item.ticket_type_name || item.attendee_name}</Text>
                {eventEnded(item, asOf) ? <Text style={sharedStyles.muted}>Past event</Text> : null}
                <StatusBadge status={admissionStatus(item)} />
                <AppButton title="Open ticket" accessibilityLabel={`Open ticket for ${item.event_title}, ending ${item.id.slice(-8)}`}
                  variant={admissionStatus(item) === "valid" ? "primary" : "secondary"} onPress={() => setOpenId(item.id)} />
              </View>
            </View>
          )}
          ListEmptyComponent={<EmptyState title="No tickets yet" message="You don't have any tickets yet." />}
        />
      )}
      {opened ? <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={sharedStyles.listContent}>
            <AppButton title="Close ticket" variant="secondary" onPress={close} />
            <TicketCard ticket={opened} pastEvent={eventEnded(opened, asOf)} qrImageSource={{ uri: getTicketQrImageUrl(opened.id) }}
              onSupport={() => {
                close();
                navigation.navigate("SupportTab", { screen: "SupportNew", params: { ticketId: opened.id } });
              }}
              onPdf={() => { void Linking.openURL(getTicketPdfUrl(opened.id))
                .catch(() => Alert.alert("Couldn't open PDF", "Check your connection and try again.")); }} />
          </ScrollView>
        </SafeAreaView>
      </Modal> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticket: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, overflow: "hidden" },
  ticketHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md,
    backgroundColor: theme.colors.night },
  ticketTitle: { color: theme.colors.surface, fontSize: theme.fontSize.title, fontWeight: "700", flex: 1 },
  ticketBody: { padding: theme.spacing.md, gap: theme.spacing.sm },
  modal: { flex: 1, backgroundColor: theme.colors.background },
});
