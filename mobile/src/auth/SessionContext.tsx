import * as SecureStore from "expo-secure-store";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren,
} from "react";

import { getMe, login } from "../api/auth";
import { ApiError } from "../api/client";
import type { User } from "../types/auth";

const TOKEN_KEY = "biletflow.staff.token"; // Keep old key to preserve existing scanner logins.
const USER_KEY = "biletflow.staff.user";

type SessionState =
  | { status: "restoring" }
  | { status: "signedOut" }
  | { status: "signedIn"; token: string; user: User };

interface SessionValue {
  state: SessionState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Run a request with the signed-in token. If the backend says the session is
   * no longer valid (expired token or suspended account), sign out so the app
   * returns to the login screen, then rethrow so the screen can show the error.
   */
  authed: <T>(call: (token: string) => Promise<T>) => Promise<T>;
}

const SessionContext = createContext<SessionValue | null>(null);

// SecureStore keeps the token in the phone's keychain. It is unavailable on web,
// so storage failures are ignored there: the session then lasts until reload.
async function saveSession(token: string, user: User) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch { /* not persisted */ }
}

async function clearSession() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch { /* nothing stored */ }
}

async function readSession(): Promise<{ token: string; user: User } | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const user = await SecureStore.getItemAsync(USER_KEY);
    if (!token || !user) return null;
    return { token, user: JSON.parse(user) as User };
  } catch {
    return null;
  }
}

// 401 always means the token is no longer accepted. 403 usually means "not allowed
// for this event" and must not sign anyone out, except for a suspended account.
function isSessionEnded(error: ApiError) {
  return error.status === 401 || (error.status === 403 && /suspended/i.test(error.message));
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: "restoring" });

  // On launch, reuse a saved token. Ask the backend who it belongs to, so an
  // expired token or a suspended account goes back to the login screen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await readSession();
      if (!saved) {
        if (!cancelled) setState({ status: "signedOut" });
        return;
      }
      try {
        const user = await getMe(saved.token);
        if (cancelled) return;
        await saveSession(saved.token, user);
        setState({ status: "signedIn", token: saved.token, user });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await clearSession();
          setState({ status: "signedOut" });
        } else {
          // Backend unreachable right now: keep the saved session; later
          // requests will show the connection error and can be retried.
          setState({ status: "signedIn", ...saved });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, ...user } = await login(email, password);
    await saveSession(token, user);
    setState({ status: "signedIn", token, user });
  }, []);

  const signOut = useCallback(async () => {
    // Tokens are stateless on the backend, so signing out means forgetting it.
    await clearSession();
    setState({ status: "signedOut" });
  }, []);

  const token = state.status === "signedIn" ? state.token : null;
  const authed = useCallback(async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
    if (!token) throw new Error("Please sign in first.");
    try {
      return await call(token);
    } catch (error) {
      if (error instanceof ApiError && isSessionEnded(error)) await signOut();
      throw error;
    }
  }, [token, signOut]);

  const value = useMemo(
    () => ({ state, signIn, signOut, authed }),
    [state, signIn, signOut, authed],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
