import * as SecureStore from "expo-secure-store";

import type { CheckoutInput } from "../types/order";

export interface PurchaseAttempt { key: string; body: CheckoutInput }
const storageKey = (userId: string, eventId: string) => `biletflow.purchase.${userId}.${eventId}`;
const inFlight = new Set<string>();

/** One mutation per account/event across mounted checkout screens, not just taps. */
export function acquirePurchaseLock(userId: string, eventId: string): (() => void) | null {
  const key = storageKey(userId, eventId);
  if (inFlight.has(key)) return null;
  inFlight.add(key);
  return () => { inFlight.delete(key); };
}

export async function readPurchaseAttempt(userId: string, eventId: string): Promise<PurchaseAttempt | null> {
  const saved = await SecureStore.getItemAsync(storageKey(userId, eventId));
  if (!saved) return null;
  const value: PurchaseAttempt = JSON.parse(saved);
  if (!value.key || value.body?.event_id !== eventId || !value.body.ticket_type_id) {
    throw new Error("The saved purchase could not be read. Check My Tickets before trying another purchase.");
  }
  return value;
}

export function savePurchaseAttempt(userId: string, attempt: PurchaseAttempt): Promise<void> {
  return SecureStore.setItemAsync(storageKey(userId, attempt.body.event_id), JSON.stringify(attempt));
}

export function clearPurchaseAttempt(userId: string, eventId: string): Promise<void> {
  return SecureStore.deleteItemAsync(storageKey(userId, eventId));
}
