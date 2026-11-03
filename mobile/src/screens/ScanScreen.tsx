import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, Vibration, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { verifyQr } from "../api/checkin";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { LoadingState } from "../components/LoadingState";
import { ScanResultPanel } from "../components/ScanResultPanel";
import { Screen } from "../components/Screen";
import type { ScannerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { outcomeFromError, outcomeFromResponse, type ScanOutcome } from "../utils/scanOutcome";

type Props = NativeStackScreenProps<ScannerStackParamList, "Scan">;

type Phase =
  | { kind: "scanning" }
  | { kind: "checking"; code: string }
  | { kind: "result"; code: string; outcome: ScanOutcome };

/** How long a valid result stays up before the camera scans again. */
const AUTO_DISMISS_MS = 2500;
/**
 * After a result is closed, the same QR is usually still in front of the camera.
 * Ignore that exact code for this long so it doesn't immediately re-scan as
 * "Already checked in".
 */
const SAME_CODE_COOLDOWN_MS = 3000;

export function ScanScreen({ route }: Props) {
  const { eventId } = route.params;
  const { authed } = useSession();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // onBarcodeScanned fires many times per second while a code is in view, and
  // state updates are not instant, so a ref is the real "busy" lock.
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; closedAt: number } | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const check = useCallback(async (code: string) => {
    busy.current = true;
    setPhase({ kind: "checking", code });
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    let outcome: ScanOutcome;
    try {
      const response = await authed((token) => verifyQr(token, code, eventId, controller.signal));
      outcome = outcomeFromResponse(response);
    } catch (error) {
      outcome = outcomeFromError(error);
    }
    if (controller.signal.aborted) return;

    Vibration.vibrate(outcome.tone === "success" ? 80 : [0, 250, 120, 250]);
    setPhase({ kind: "result", code, outcome });
  }, [authed, eventId]);

  const handleScanned = useCallback(({ data }: BarcodeScanningResult) => {
    const code = data.trim();
    if (busy.current || !code) return;
    const recent = lastCode.current;
    if (recent && recent.code === code && Date.now() - recent.closedAt < SAME_CODE_COOLDOWN_MS) return;
    void check(code);
  }, [check]);

  const scanNext = useCallback(() => {
    if (phase.kind === "result") lastCode.current = { code: phase.code, closedAt: Date.now() };
    busy.current = false;
    setPhase({ kind: "scanning" });
  }, [phase]);

  const retry = useCallback(() => {
    if (phase.kind === "result") void check(phase.code);
  }, [phase, check]);

  // Valid tickets clear themselves so a queue keeps moving; problems stay until tapped.
  useEffect(() => {
    if (phase.kind !== "result" || !phase.outcome.autoDismiss) return;
    const timer = setTimeout(scanNext, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase, scanNext]);

  if (!permission) {
    return <Screen><LoadingState message="Checking camera access…" /></Screen>;
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <Screen>
        <View style={sharedStyles.state}>
          <Text accessibilityRole="header" style={[sharedStyles.title, sharedStyles.centeredText]}>
            Camera access needed
          </Text>
          <Text style={[sharedStyles.body, sharedStyles.centeredText]}>
            {canAsk
              ? "BiletFlow uses the camera only to read ticket QR codes at the door."
              : "Camera access is turned off for this app. Turn it on in Settings to scan tickets."}
          </Text>
          <AppButton
            title={canAsk ? "Allow camera" : "Open Settings"}
            onPress={() => { void (canAsk ? requestPermission() : Linking.openSettings()); }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      {/* Only one camera preview may run at a time, so unmount it when this screen isn't shown. */}
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={phase.kind === "scanning" ? handleScanned : undefined}
          onMountError={(event) => setCameraError(event.message)}
        />
      )}

      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {cameraError ? `Camera couldn't start: ${cameraError}` : "Point the camera at the ticket's QR code"}
        </Text>
      </View>

      {Platform.OS !== "web" && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: torchOn }}
            accessibilityLabel="Flashlight"
            onPress={() => setTorchOn((on) => !on)}
            style={({ pressed }) => [styles.torch, torchOn && styles.torchOn, pressed && styles.pressed]}
          >
            <Text style={[styles.torchLabel, torchOn && styles.torchLabelOn]}>
              {torchOn ? "Light on" : "Light off"}
            </Text>
          </Pressable>
        </View>
      )}

      {phase.kind === "checking" && (
        <View style={styles.checking} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.checkingText}>Checking ticket…</Text>
        </View>
      )}

      {phase.kind === "result" && (
        <ScanResultPanel outcome={phase.outcome} onScanNext={scanNext} onRetry={retry} />
      )}
    </View>
  );
}

const FRAME_SIZE = 240;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.lg,
    pointerEvents: "none",
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    borderRadius: theme.radius.md,
  },
  hint: {
    color: "#FFFFFF",
    fontSize: theme.fontSize.body,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: theme.spacing.lg,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowRadius: 4,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: theme.spacing.md,
  },
  torch: {
    minHeight: 48,
    minWidth: 140,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  torchOn: { backgroundColor: "#FFFFFF" },
  torchLabel: { color: "#FFFFFF", fontSize: theme.fontSize.body, fontWeight: "700" },
  torchLabelOn: { color: "#000000" },
  pressed: { opacity: 0.7 },
  checking: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  checkingText: { color: "#FFFFFF", fontSize: theme.fontSize.title, fontWeight: "700" },
});
