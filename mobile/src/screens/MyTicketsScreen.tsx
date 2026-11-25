import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getMyTickets, getTicketPdf } from "../api/tickets";
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
import { useLocale } from "../i18n/LocaleContext";

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
  const { lang, t: localize } = useLocale();
  const { authed, state } = useSession();
  const [openId, setOpenId] = useState<string>();
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pdfRequest.current?.abort(), []);
  const close = () => {
    pdfRequest.current?.abort();
    setOpenId(undefined);
    setPdfLoading(false);
  };
  async function openPdf(ticketId: string) {
    if (pdfRequest.current) return;
    const request = new AbortController();
    pdfRequest.current = request;
    setPdfLoading(true);
    let file: File | undefined;
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error("PDF sharing is unavailable on this device.");
      const pdf = await authed((token) => getTicketPdf(ticketId, token, request.signal));
      if (request.signal.aborted) return;
      file = new File(Paths.cache, `ticket-${encodeURIComponent(ticketId)}.pdf`);
      file.create({ overwrite: true });
      file.write(pdf);
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    } catch (error) {
      if (!request.signal.aborted) Alert.alert(localize("Couldn't open PDF"), error instanceof Error ? error.message : "Please try again.");
    } finally {
      try { if (file?.exists) file.delete(); } catch { /* The operating system can clear its cache. */ }
      pdfRequest.current = null;
      if (!request.signal.aborted) setPdfLoading(false);
    }
  }
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
    { title: localize("Upcoming tickets"), data: upcoming },
    { title: localize("Past and inactive tickets"), data: historical },
  ].filter((section) => section.data.length > 0);
  const opened = error ? undefined : data?.tickets.find((ticket) => ticket.id === openId);

  return (
    <Screen>
      {loading ? <LoadingState message={localize("Loading your tickets…")} /> : error ? (
        <ErrorState title={localize("Couldn't load your tickets")} message={error} onRetry={retry} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(ticket) => ticket.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={<AppButton title={localize("Purchase history")} variant="secondary" onPress={() => navigation.navigate("OrderHistory")} />}
          renderSectionHeader={({ section }) => <Text style={sharedStyles.title} accessibilityRole="header">{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={styles.ticket}>
              <View style={styles.ticketHeader}>
                <BrandIcon name={admissionStatus(item) === "valid" ? "qr" : "ticket"} color="#CFC1FF" />
                <Text style={styles.ticketTitle}>{item.event_title}</Text>
              </View>
              <View style={styles.ticketBody}>
                <Text style={sharedStyles.muted}>{formatDateTime(item.start_time, lang)}</Text>
                {item.venue_name ? <Text style={sharedStyles.body}>{item.venue_name}</Text> : null}
                <Text style={sharedStyles.muted}>{item.ticket_type_name || item.attendee_name}</Text>
                {eventEnded(item, asOf) ? <Text style={sharedStyles.muted}>{localize("Past event")}</Text> : null}
                <StatusBadge status={admissionStatus(item)} />
                <AppButton title={localize("Open ticket")} accessibilityLabel={`Open ticket for ${item.event_title}, ending ${item.id.slice(-8)}`}
                  variant={admissionStatus(item) === "valid" ? "primary" : "secondary"} onPress={() => setOpenId(item.id)} />
              </View>
            </View>
          )}
          ListEmptyComponent={<EmptyState title={localize("No tickets yet")} message={localize("You don't have any tickets yet.")} />}
        />
      )}
      {opened && state.status === "signedIn" ? <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={sharedStyles.listContent}>
            <AppButton title={localize("Close ticket")} variant="secondary" onPress={close} />
            <TicketCard ticket={opened} pastEvent={eventEnded(opened, asOf)}
              onSupport={() => {
                close();
                navigation.navigate("SupportTab", { screen: "SupportNew", params: { ticketId: opened.id } });
              }}
              pdfLoading={pdfLoading} onPdf={() => { void openPdf(opened.id); }} />
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
