import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { environment } from "../config/environment";
import { sharedStyles, theme } from "../theme";
import { LoadingState } from "./LoadingState";

export function EventImage({ uri, title }: { uri: string; title: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const url = uri.startsWith("/") ? `${environment.apiBaseUrl}${uri}` : uri;
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setStatus((current) => current === "loading" ? "error" : current), 15_000);
    return () => clearTimeout(timer);
  }, [status]);
  if (status === "error") return <Text style={sharedStyles.muted}>Event image unavailable.</Text>;
  return (
    <View style={styles.frame}>
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} accessibilityLabel={title}
        onLoad={() => setStatus((current) => current === "loading" ? "ready" : current)} onError={() => setStatus("error")} />
      {status === "loading" ? <LoadingState message="Loading event image…" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, overflow: "hidden", borderRadius: theme.radius.sm },
});
