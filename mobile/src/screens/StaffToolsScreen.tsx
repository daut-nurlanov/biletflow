import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native";

import { searchTickets, undoCheckin, verifyQr } from "../api/checkin";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { AttendanceSummary } from "../components/AttendanceSummary";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { ScannerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import type { SearchTicket } from "../types/checkin";
import { outcomeFromResponse } from "../utils/scanOutcome";

type Props = NativeStackScreenProps<ScannerStackParamList, "StaffTools">;

export function StaffToolsScreen({ route }: Props) {
  const { eventId, eventTitle } = route.params;
  const { authed } = useSession();
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  useFocusEffect(useCallback(() => () => request.current?.abort(), []));

  const load = useCallback((signal: AbortSignal) => term
    ? authed((token) => searchTickets(token, eventId, term, signal))
    : Promise.resolve([] as SearchTicket[]), [authed, eventId, term]);
  const results = useApiResource(load);

  function search() {
    if (locked.current) return;
    const name = query.trim();
    if (Array.from(name).length < 2) { setValidation("Enter at least two characters to search."); return; }
    setValidation(null);
    setActionError(null);
    setMessage(null);
    if (name === term) results.retry();
    else setTerm(name);
  }

  async function act(ticket: SearchTicket, undo: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusyId(ticket.id);
    setActionError(null);
    setMessage(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      if (undo) {
        await authed((token) => undoCheckin(token, ticket.id, controller.signal));
        if (!controller.signal.aborted) setMessage(`Check-in reversed for ${ticket.attendee_name}.`);
      } else {
        const response = await authed((token) => verifyQr(token, ticket.qr_code_hash, eventId, controller.signal));
        if (!controller.signal.aborted) {
          const outcome = outcomeFromResponse(response);
          setMessage(`${outcome.headline}. ${outcome.message}`);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) setActionError(
        `${error instanceof Error ? error.message : "Couldn't update this ticket."} Refresh the search before trying again; the server may have completed the request.`,
      );
    } finally {
      locked.current = false;
      setBusyId(null);
      if (!controller.signal.aborted) {
        results.retry();
        setRevision((value) => value + 1);
      }
    }
  }

  function confirmUndo(ticket: SearchTicket) {
    Alert.alert("Undo check-in?", `Reverse check-in for ${ticket.attendee_name}'s ticket ending ${ticket.id.slice(-8)}? It can be used to enter again.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Undo check-in", style: "destructive", onPress: () => { void act(ticket, true); } },
    ]);
  }

  return (
    <Screen>
      <FlatList
        data={results.error || results.loading ? [] : results.data ?? []}
        keyExtractor={(ticket) => ticket.id}
        contentContainerStyle={sharedStyles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={results.refreshing}
        onRefresh={results.refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
            <AttendanceSummary key={revision} eventId={eventId} />
            <Text style={sharedStyles.body}>Find a ticket by name, email, ticket ID, or its last 8 characters.</Text>
            <TextInput accessibilityLabel="Name, email or ticket ID" style={styles.input}
              value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false}
              placeholder="Name, email or ticket ID" placeholderTextColor={theme.colors.muted}
              returnKeyType="search" onSubmitEditing={search} editable={!busyId} />
            <AppButton title="Search tickets" onPress={search} disabled={!!busyId} />
            {validation ? <Text accessibilityRole="alert" style={sharedStyles.body}>{validation}</Text> : null}
            {actionError ? <Text accessibilityRole="alert" style={sharedStyles.body}>{actionError}</Text> : null}
            {message ? <Text accessibilityRole="alert" style={sharedStyles.body}>{message}</Text> : null}
            {term && results.loading ? <LoadingState message="Searching tickets…" /> : null}
            {results.error ? <ErrorState message={results.error} onRetry={results.retry} /> : null}
          </View>
        }
        ListEmptyComponent={term && !results.loading && !results.error
          ? <Text style={sharedStyles.muted}>No matching tickets. Try another name or email.</Text> : undefined}
        renderItem={({ item }) => {
          const reference = item.id.slice(-8);
          const ticketLabel = `${item.attendee_name}, ${item.ticket_type_name}, ticket ending ${reference}`;
          return (
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.title}>{item.attendee_name}</Text>
              <Text style={sharedStyles.body}>{item.ticket_type_name}</Text>
              <Text style={sharedStyles.muted}>Ticket ending {reference}</Text>
              {item.section ? <Text style={sharedStyles.body}>Section {item.section}, row {item.row_label}, seat {item.seat_number}</Text> : null}
              <StatusBadge status={item.status} />
              {item.status === "valid" ? <AppButton title="Check in" accessibilityLabel={`Check in ${ticketLabel}`}
                onPress={() => { void act(item, false); }} disabled={!!busyId} loading={busyId === item.id} /> : null}
              {item.status === "checked_in" ? <AppButton title="Undo check-in" variant="secondary" accessibilityLabel={`Undo check-in for ${ticketLabel}`}
                onPress={() => confirmUndo(item)} disabled={!!busyId} loading={busyId === item.id} /> : null}
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.md },
  input: {
    minHeight: 48, paddingHorizontal: theme.spacing.md, borderWidth: 1,
    borderColor: theme.colors.fieldBorder, borderRadius: theme.radius.sm,
    color: theme.colors.text, backgroundColor: theme.colors.surface, fontSize: theme.fontSize.body,
  },
});
