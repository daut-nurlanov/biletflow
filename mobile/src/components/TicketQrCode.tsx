import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { getTicketQr } from "../api/tickets";
import { useSession } from "../auth/SessionContext";
import { theme } from "../theme";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

interface TicketQrCodeProps {
  ticketId: string;
  accessibilityLabel: string;
}

export function TicketQrCode(props: TicketQrCodeProps) {
  const [attempt, setAttempt] = useState(0);

  return (
    <QrImageAttempt
      {...props}
      key={`${props.ticketId}:${attempt}`}
      onRetry={() => setAttempt((previous) => previous + 1)}
    />
  );
}

// Each attempt fetches the protected PNG through the session-aware API.
function QrImageAttempt({
  ticketId,
  accessibilityLabel,
  onRetry,
}: TicketQrCodeProps & { onRetry: () => void }) {
  const { authed } = useSession();
  const [uri, setUri] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const reader = new FileReader();
    const fail = () => {
      if (!controller.signal.aborted) setState("error");
    };
    reader.onload = () => {
      if (controller.signal.aborted) return;
      if (typeof reader.result === "string") setUri(reader.result);
      else fail();
    };
    reader.onerror = fail;

    void authed((token) => getTicketQr(ticketId, token, controller.signal))
      .then((png) => { if (!controller.signal.aborted) reader.readAsDataURL(png); })
      .catch(fail);
    return () => {
      controller.abort();
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [authed, ticketId]);

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
        {uri ? <Image
          source={{ uri }}
          resizeMode="contain"
          fadeDuration={0}
          accessible={state === "ready"}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          style={[StyleSheet.absoluteFill, state !== "ready" && styles.hidden]}
          onLoad={() => setState((current) => current === "loading" ? "ready" : current)}
          onError={() => setState((current) => current === "loading" ? "error" : current)}
        /> : null}
        {state === "loading" ? <LoadingState message="Loading admission QR…" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 326,
    aspectRatio: 1,
    // Extra white space around the server's QR border; never crop or tint it.
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  imageArea: { flex: 1 },
  hidden: { opacity: 0 },
});
