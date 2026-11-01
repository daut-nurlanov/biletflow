import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useLayoutEffect, useMemo } from "react";
import { Alert, Platform, Pressable, SectionList, StyleSheet, Text } from "react-native";

import { getStaffEvents } from "../api/staff";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StaffEventCard } from "../components/StaffEventCard";
import { useApiResource } from "../hooks/useApiResource";
import type { ScannerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import type { StaffEvent } from "../types/event";
import { getEventTiming, type EventTiming } from "../utils/eventTiming";

type Props = NativeStackScreenProps<ScannerStackParamList, "StaffEvents">;

interface Section {
  key: EventTiming;
  title: string;
  data: StaffEvent[];
}

const SECTION_TITLES: Record<EventTiming, string> = {
  today: "Today",
  upcoming: "Upcoming",
  past: "Past",
};

function groupEvents(events: StaffEvent[]): Section[] {
  const groups: Record<EventTiming, StaffEvent[]> = { today: [], upcoming: [], past: [] };
  // The server already sorts by start time; keep that order inside each group,
  // but show the most recent past events first.
  for (const event of events) groups[getEventTiming(event)].push(event);
  groups.past.reverse();
  return (["today", "upcoming", "past"] as const)
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, title: SECTION_TITLES[key], data: groups[key] }));
}

export function StaffEventsScreen({ navigation }: Props) {
  const { state, signOut, authed } = useSession();

  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getStaffEvents(token, signal)),
    [authed],
  );
  const { data, loading, refreshing, error, retry, refresh } = useApiResource(load);
  const sections = useMemo(() => groupEvents(data ?? []), [data]);

  const confirmSignOut = useCallback(() => {
    // Alert buttons don't work on web, so sign out straight away there.
    if (Platform.OS === "web") {
      void signOut();
      return;
    }
    Alert.alert("Sign out?", "You'll need your password to scan tickets again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => { void signOut(); } },
    ]);
  }, [signOut]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" onPress={confirmSignOut} hitSlop={12}>
          <Text style={styles.headerButton}>Sign out</Text>
        </Pressable>
      ),
    });
  }, [navigation, confirmSignOut]);

  const userName = state.status === "signedIn" ? state.user.full_name || state.user.email : "";

  return (
    <Screen>
      {loading ? <LoadingState message="Loading your events…" /> : error ? (
        <ErrorState title="Couldn't load your events" message={error} onRetry={retry} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(event) => event.id}
          contentContainerStyle={sharedStyles.listContent}
          stickySectionHeadersEnabled={false}
          refreshing={refreshing}
          onRefresh={refresh}
          ListHeaderComponent={
            <Text style={sharedStyles.muted}>
              Signed in as {userName}. Choose the event you are working at.
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item, section }) => (
            <StaffEventCard
              event={item}
              timing={section.key}
              onPress={() => navigation.navigate("Scan", { eventId: item.id, eventTitle: item.title })}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No events assigned"
              message="Ask the event organizer to add you as door staff, then pull down to refresh."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerButton: { color: theme.colors.primary, fontSize: theme.fontSize.body, fontWeight: "600" },
  sectionTitle: {
    fontSize: theme.fontSize.small,
    fontWeight: "700",
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: theme.spacing.sm,
  },
});
