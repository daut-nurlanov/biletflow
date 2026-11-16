import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

/** Pass a stable loader (a module function or useCallback). Refresh on focus. */
export function useApiResource<T>(load: (signal: AbortSignal) => Promise<T>, refreshIntervalMs?: number) {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });
  const activeRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async (refreshing = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState((previous) => ({
      ...previous, loading: !refreshing, refreshing, error: null,
    }));

    try {
      const data = await load(controller.signal);
      if (!controller.signal.aborted) {
        setState({ data, loading: false, refreshing: false, error: null });
      }
    } catch (error) {
      // A blurred screen or an older request must never overwrite newer data.
      if (!controller.signal.aborted) {
        setState((previous) => ({
          ...previous,
          loading: false,
          refreshing: false,
          error: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        }));
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [load]);

  useFocusEffect(useCallback(() => {
    void reload();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && previous !== "active") void reload();
      if (next !== "active") activeRequest.current?.abort();
      previous = next;
    });
    const timer = refreshIntervalMs ? setInterval(() => {
      if (AppState.currentState === "active" && !activeRequest.current) void reload(true);
    }, refreshIntervalMs) : undefined;
    return () => {
      clearInterval(timer);
      subscription.remove();
      activeRequest.current?.abort();
    };
  }, [reload, refreshIntervalMs]));

  return {
    ...state,
    retry: () => { void reload(); },
    refresh: () => { void reload(true); },
  };
}
