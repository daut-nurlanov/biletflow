import { usePreventRemove } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { Alert, Keyboard } from "react-native";

import { ApiError } from "../api/client";
import { getEvent } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { useApiResource } from "./useApiResource";

export function useManagedEvent(eventId: string) {
  const { state, authed } = useSession();
  const organizerId = state.status === "signedIn" && state.user.role === "organizer" ? state.user.id : null;
  const load = useCallback(async (signal: AbortSignal) => {
    if (!organizerId) throw new Error("Sign in as an organizer to manage events.");
    const event = await authed((token) => getEvent(eventId, signal, token));
    if (event.organizer_id !== organizerId) throw new Error("You do not manage this event.");
    return event;
  }, [authed, eventId, organizerId]);
  const resource = useApiResource(load);
  const event = resource.data;
  return { ...resource, data: event?.id === eventId && event.organizer_id === organizerId ? event : null };
}

export function useOrganizerSave() {
  const { authed } = useSession();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePreventRemove(busy, () => Alert.alert("Saving changes", "Wait for the current request to finish."));

  async function save<T>(request: (token: string) => Promise<T>, verifyMessage: string): Promise<T | undefined> {
    if (lock.current) return;
    lock.current = true;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      return await authed(request);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't save your changes.";
      setError(caught instanceof ApiError && caught.status < 500 ? message : `${message} ${verifyMessage}`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return { busy, error, setError, save };
}
