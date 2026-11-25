import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { campaignTokenFromInput, resolveCampaign } from "../api/promotions";
import { sharedStyles } from "../theme";
import { formStyles } from "../theme/forms";
import { AppButton } from "./AppButton";
import { useLocale } from "../i18n/LocaleContext";

export function CampaignEntry({ onOpen }: { onOpen: (eventId: string, campaignToken: string) => void }) {
  const { t: localize } = useLocale();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  async function open() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      const token = campaignTokenFromInput(input);
      if (!token) throw new Error("Paste a campaign link with ?c=, or its campaign token.");
      const campaign = await resolveCampaign(token);
      onOpen(campaign.event_id, token);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't open this campaign."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <View style={sharedStyles.card}>
    <Text style={sharedStyles.title}>{localize("Have a campaign link?")}</Text>
    <TextInput accessibilityLabel={localize("Campaign link")} style={formStyles.input} value={input} onChangeText={setInput}
      autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder={localize("Paste your campaign link")} />
    {error ? <Text accessibilityRole="alert" style={formStyles.error}>{error}</Text> : null}
    <AppButton title={localize("Open campaign offer")} onPress={() => { void open(); }} disabled={busy || !input.trim()} loading={busy} />
  </View>;
}
