import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View,
} from "react-native";

import { createPromoCampaign, getPromoCampaigns, promoQrImageSource, setPromoCampaignActive } from "../api/organizer";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterChips } from "../components/FilterChips";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import type { DiscountType, PromoCampaign } from "../types/organizer";
import { formatDateTime } from "../utils/formatting";
import { campaignInput, discountLabel, organizerMessage, usageLabel } from "../utils/organizerOrders";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventPromotions">;

const TYPE_OPTIONS = [
  { value: "percentage", label: "Percent (%)" },
  { value: "fixed", label: "Fixed (KZT)" },
] as const;

export function EventPromotionsScreen({ route }: Props) {
  const { eventId, eventTitle } = route.params;
  const { authed, state } = useSession();
  const token = state.status === "signedIn" ? state.token : null;
  const load = useCallback(
    (signal: AbortSignal) => authed((t) => getPromoCampaigns(t, eventId, signal))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed, eventId],
  );
  const resource = useApiResource(load);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [maxRedemptions, setMaxRedemptions] = useState("50");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [shownQr, setShownQr] = useState<string | null>(null);
  const locked = useRef(false);

  async function change(id: string, task: (t: string) => Promise<string>) {
    if (locked.current) return;
    locked.current = true;
    Keyboard.dismiss();
    setBusyId(id);
    setNotice(null);
    try {
      setNotice({ text: await authed(task), error: false });
    } catch (caught) {
      setNotice({ text: organizerMessage(caught), error: true });
    } finally {
      // A lost answer may still have changed the campaign, so always reload.
      resource.refresh();
      setBusyId(null);
      locked.current = false;
    }
  }

  function create() {
    const checked = campaignInput({ code, discountType, discountValue, maxRedemptions });
    if ("error" in checked) {
      Keyboard.dismiss();
      setNotice({ text: checked.error, error: true });
      return;
    }
    void change("new", async (t) => {
      const made = await createPromoCampaign(t, eventId, checked.input);
      setCode("");
      setShownQr(made.id);
      return `Campaign ${made.code} created. Its QR is shown below.`;
    });
  }

  function toggle(campaign: PromoCampaign) {
    void change(campaign.id, async (t) => {
      await setPromoCampaignActive(t, campaign.id, !campaign.is_active);
      return campaign.is_active ? `${campaign.code} disabled. The code and QR stop working.` : `${campaign.code} enabled.`;
    });
  }

  const busy = busyId !== null;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={resource.loading || resource.error ? [] : resource.data ?? []}
          keyExtractor={(campaign) => campaign.id}
          extraData={{ busyId, shownQr }}
          contentContainerStyle={sharedStyles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
              <Text style={sharedStyles.muted}>
                A campaign gives buyers a discount through a code or a QR link. The server always calculates the price, so a link can&apos;t change it.
              </Text>

              <View style={[sharedStyles.card, styles.form]}>
                <Text accessibilityRole="header" style={sharedStyles.title}>New campaign</Text>
                <Text style={sharedStyles.body} nativeID="promoCodeLabel">Code (leave empty to generate one)</Text>
                <TextInput accessibilityLabelledBy="promoCodeLabel" style={formStyles.input} value={code} onChangeText={setCode}
                  autoCapitalize="characters" autoCorrect={false} maxLength={40} editable={!busy} placeholder="For example: DEMO20"
                  placeholderTextColor={theme.colors.muted} />
                <FilterChips label="Discount type" options={TYPE_OPTIONS} value={discountType}
                  onChange={(value) => setDiscountType(value as DiscountType)} />
                <View style={styles.pair}>
                  <View style={styles.flex}>
                    <Text style={sharedStyles.body} nativeID="promoValueLabel">{discountType === "percentage" ? "Discount (%)" : "Discount (KZT)"}</Text>
                    <TextInput accessibilityLabelledBy="promoValueLabel" style={formStyles.input} value={discountValue}
                      onChangeText={setDiscountValue} keyboardType="decimal-pad" editable={!busy} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={sharedStyles.body} nativeID="promoMaxLabel">Max uses</Text>
                    <TextInput accessibilityLabelledBy="promoMaxLabel" style={formStyles.input} value={maxRedemptions}
                      onChangeText={setMaxRedemptions} keyboardType="number-pad" editable={!busy} />
                  </View>
                </View>
                <AppButton title={busyId === "new" ? "Creating…" : "Create campaign"} onPress={create} disabled={busy} loading={busyId === "new"} />
                <Text style={sharedStyles.muted}>Start and end dates can be set on the website.</Text>
              </View>

              {notice ? (
                <Text accessibilityRole="alert" style={notice.error ? formStyles.error : sharedStyles.body}>{notice.text}</Text>
              ) : null}
              <Text accessibilityRole="header" style={sharedStyles.title}>Campaigns</Text>
            </View>
          }
          ListEmptyComponent={
            resource.loading ? <LoadingState message="Loading campaigns…" />
              : resource.error ? <ErrorState title="Couldn't load campaigns" message={resource.error} onRetry={resource.retry} />
                : <EmptyState title="No campaigns yet" message="Create one above to get a code and a QR to share." />
          }
          renderItem={({ item }) => (
            <View style={sharedStyles.card}>
              <View style={styles.rowTop}>
                <Text style={[sharedStyles.title, styles.flex]} selectable>{item.code}</Text>
                <Text style={[styles.state, item.is_active ? styles.on : styles.off]}>{item.is_active ? "Active" : "Disabled"}</Text>
              </View>
              <Text style={sharedStyles.body}>{discountLabel(item)}</Text>
              <Text style={sharedStyles.muted}>{usageLabel(item)}</Text>
              {item.valid_until ? <Text style={sharedStyles.muted}>{`Ends ${formatDateTime(item.valid_until)}`}</Text> : null}
              <View style={styles.buttons}>
                <SecondaryButton
                  title={shownQr === item.id ? "Hide QR" : "Show QR"}
                  onPress={() => setShownQr(shownQr === item.id ? null : item.id)}
                />
                <SecondaryButton
                  title={item.is_active ? "Disable" : "Enable"}
                  onPress={() => toggle(item)}
                  disabled={busy}
                  loading={busyId === item.id}
                />
              </View>
              {shownQr === item.id && token ? (
                <View style={styles.qrBlock}>
                  <CampaignQr token={token} campaign={item} />
                  <Text style={sharedStyles.muted} selectable>{item.campaign_link}</Text>
                  <SecondaryButton
                    title="Share link"
                    onPress={() => { void Share.share({ message: `${item.code}: ${item.campaign_link}` }); }}
                  />
                  {!item.is_active ? <Text style={sharedStyles.muted}>This campaign is disabled, so its QR won&apos;t give a discount.</Text> : null}
                </View>
              ) : null}
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SecondaryButton({ title, onPress, disabled = false, loading = false }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean;
}) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, (pressed || unavailable) && styles.dimmed]}
    >
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      <Text style={styles.secondaryText}>{title}</Text>
    </Pressable>
  );
}

/** The blue campaign QR, loaded with the organizer's token. */
function CampaignQr({ token, campaign }: { token: string; campaign: PromoCampaign }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const source = promoQrImageSource(token, campaign.id);

  if (state === "error") {
    return (
      <View style={styles.qrError}>
        <Text style={sharedStyles.body}>The QR couldn&apos;t be loaded.</Text>
        <SecondaryButton title="Try again" onPress={() => { setState("loading"); setAttempt((n) => n + 1); }} />
      </View>
    );
  }
  return (
    <View style={styles.qrFrame}>
      <Image
        key={attempt}
        source={attempt > 0 ? { ...source, cache: "reload" } : source}
        style={styles.qr}
        resizeMode="contain"
        accessibilityLabel={`Campaign QR for ${campaign.code}. Buyers scan it to open the event with the discount.`}
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
      />
      {state === "loading" ? <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.colors.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: theme.spacing.sm },
  form: { gap: theme.spacing.sm },
  pair: { flexDirection: "row", gap: theme.spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  state: { fontSize: theme.fontSize.small, fontWeight: "700", paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.sm, overflow: "hidden" },
  on: { backgroundColor: "#E0F2E9", color: "#176052" },
  off: { backgroundColor: "#E9EDF1", color: "#405362" },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  secondary: {
    minHeight: 44, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.sm, borderWidth: 2,
    borderColor: theme.colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm,
  },
  secondaryText: { color: theme.colors.primary, fontSize: theme.fontSize.body, fontWeight: "600" },
  dimmed: { opacity: 0.6 },
  qrBlock: { gap: theme.spacing.sm, alignItems: "flex-start" },
  qrFrame: { width: 220, height: 220, backgroundColor: "#FFFFFF", borderRadius: theme.radius.sm, alignSelf: "center" },
  qr: { width: 220, height: 220 },
  qrError: { gap: theme.spacing.sm },
});
