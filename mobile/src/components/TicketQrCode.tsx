import { useEffect, useState } from "react";
import type { ImageURISource } from "react-native";
import { Image, StyleSheet, View } from "react-native";

import { theme } from "../theme";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

interface TicketQrCodeProps {
  source: ImageURISource;
  accessibilityLabel: string;
}

export function TicketQrCode(props: TicketQrCodeProps) {
  const [attempt, setAttempt] = useState(0);

  return (
    <QrImageAttempt
      {...props}
      key={`${props.source.uri}:${attempt}`}
      reload={attempt > 0}
      onRetry={() => setAttempt((previous) => previous + 1)}
    />
  );
}

// A fresh native image and load state for each retry or ticket URL.
function QrImageAttempt({
  source,
  accessibilityLabel,
  reload,
  onRetry,
}: TicketQrCodeProps & { reload: boolean; onRetry: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = setTimeout(() => {
      setState((current) => current === "loading" ? "error" : current);
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [state]);

  if (state === "error") {
    return (
      <ErrorState
        title="Couldn't load the admission QR"
        message="Check your connection and try again. You can also ask door staff for help."
        onRetry={onRetry}
      />
    );
  }

  return (
    <View style={styles.frame}>
      <View style={styles.imageArea}>
        <Image
          source={reload ? { ...source, cache: "reload" } : source}
          resizeMode="contain"
          fadeDuration={0}
          accessible={state === "ready"}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          style={[StyleSheet.absoluteFill, state !== "ready" && styles.hidden]}
          onLoad={() => setState((current) => current === "loading" ? "ready" : current)}
          onError={() => setState((current) => current === "loading" ? "error" : current)}
        />
        {state === "loading" ? <LoadingState message="Loading admission QR…" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 280,
    aspectRatio: 1,
    // Extra white space around the server's QR border; never crop or tint it.
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  imageArea: { flex: 1 },
  hidden: { opacity: 0 },
});
