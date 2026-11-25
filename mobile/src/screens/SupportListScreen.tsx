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
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<SupportStackParamList, "SupportList">;
export function SupportListScreen({ navigation }: Props) {
  const { lang, t: localize } = useLocale();
  const { authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getSupportCases(token, signal)), [authed]);
  const resource = useApiResource(load);
  return <Screen>{resource.loading ? <LoadingState message={localize("Loading support requests…")} /> : resource.error ? (
    <ErrorState message={resource.error} onRetry={resource.retry} />
  ) : <FlatList data={resource.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={sharedStyles.listContent}
    refreshing={resource.refreshing} onRefresh={resource.refresh}
    ListHeaderComponent={<AppButton title={localize("New support request")} onPress={() => navigation.navigate("SupportNew", {})} />}
    ListEmptyComponent={<EmptyState title={localize("No support requests")} message={localize("Open help from an event or ticket, or create a request here.")} />}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SupportThread", { caseId: item.id })}>
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.title}>{localize(supportLabel(item.category))}</Text>
        <Text style={sharedStyles.body}>{item.event_title || localize(item.kind === "organizer" ? "Organizer support" : "Support request")}</Text>
        <Text style={sharedStyles.body}>{localize(supportLabel(item.status))}{item.escalated ? ` · ${localize("Escalated to platform")}` : ""}</Text>
        <Text style={sharedStyles.muted}>{localize("Updated")} {formatDateTime(item.updated_at, lang)}</Text>
      </View>
    </Pressable>} />}</Screen>;
}
