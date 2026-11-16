import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { getSupportCases } from "../api/support";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { SupportStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { supportLabel } from "../types/support";
import { formatDateTime } from "../utils/formatting";

type Props = NativeStackScreenProps<SupportStackParamList, "SupportList">;
export function SupportListScreen({ navigation }: Props) {
  const { authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getSupportCases(token, signal)), [authed]);
  const resource = useApiResource(load);
  return <Screen>{resource.loading ? <LoadingState message="Loading support requests…" /> : resource.error ? (
    <ErrorState message={resource.error} onRetry={resource.retry} />
  ) : <FlatList data={resource.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={sharedStyles.listContent}
    refreshing={resource.refreshing} onRefresh={resource.refresh}
    ListHeaderComponent={<AppButton title="New support request" onPress={() => navigation.navigate("SupportNew", {})} />}
    ListEmptyComponent={<EmptyState title="No support requests" message="Open help from an event or ticket, or create a request here." />}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SupportThread", { caseId: item.id })}>
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.title}>{supportLabel(item.category)}</Text>
        <Text style={sharedStyles.body}>{item.event_title || (item.kind === "organizer" ? "Organizer support" : "Support request")}</Text>
        <Text style={sharedStyles.body}>{supportLabel(item.status)}{item.escalated ? " · Escalated" : ""}</Text>
        <Text style={sharedStyles.muted}>Updated {formatDateTime(item.updated_at)}</Text>
      </View>
    </Pressable>} />}</Screen>;
}
