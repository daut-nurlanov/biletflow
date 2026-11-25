import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { environment } from "../config/environment";
import { theme } from "../theme";
import { BrandIcon } from "./BrandIcon";
import { LoadingState } from "./LoadingState";

export function EventImage({ uri, title, category }: { uri?: string | null; title: string; category?: string | null }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const url = uri?.startsWith("/") ? `${environment.apiBaseUrl}${uri}` : uri;
  useEffect(() => {
    if (!url || status !== "loading") return;
    const timer = setTimeout(() => setStatus((current) => current === "loading" ? "error" : current), 15_000);
    return () => clearTimeout(timer);
  }, [status, url]);
  const icon = /conference|tech|education|workshop/i.test(category ?? "") ? "grid" : "ticket";
  return (
    <View style={styles.frame}>
      {!url || status === "error" ? <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no">
        <BrandIcon name={icon} size={82} color={theme.colors.accentInk} />
      </View> : <>
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} accessibilityLabel={title}
          onLoad={() => setStatus((current) => current === "loading" ? "ready" : current)} onError={() => setStatus("error")} />
        {status === "loading" ? <LoadingState message="Loading event image…" /> : null}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 2.35, overflow: "hidden", borderRadius: theme.radius.sm, backgroundColor: theme.colors.accentSoft },
  art: { flex: 1, justifyContent: "center", alignItems: "center", transform: [{ rotate: "-16deg" }] },
});
