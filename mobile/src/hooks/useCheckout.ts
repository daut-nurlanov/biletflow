import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { checkoutOrder, quoteOrder } from "../api/orders";
import { campaignTokenFromInput, resolveCampaign } from "../api/promotions";
import { acquirePurchaseLock, clearPurchaseAttempt, readPurchaseAttempt, savePurchaseAttempt, type PurchaseAttempt } from "../auth/PurchaseAttempt";
import { useSession } from "../auth/SessionContext";
import type { EventDetails } from "../types/event";
import type { CheckoutResponse } from "../types/order";
import { QUOTE_LIFETIME_MS, sameQuote, selectionError } from "../utils/checkout";
import { useApiResource } from "./useApiResource";

export function useCheckout(event: EventDetails, initialTypeId?: string, initialCampaignToken?: string) {
  const { state, authed } = useSession();
  const userId = state.status === "signedIn" ? state.user.id : "";
  const [form, setForm] = useState({ typeId: initialTypeId ?? "", quantity: 1,
    name: state.status === "signedIn" ? state.user.full_name ?? "" : "", promo: "" });
  const [attempt, setAttempt] = useState<PurchaseAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoPending, setPromoPending] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [initializingPromo, setInitializingPromo] = useState(!!initialCampaignToken);
  const openedCampaign = useRef(false);
  const [confirmation, setConfirmation] = useState<CheckoutResponse | null>(null);
  const [expiredQuote, setExpiredQuote] = useState<object | null>(null);
  const [quoteVersion, setQuoteVersion] = useState(0);
  const quoteRevision = useRef(0);
  // Invalidate synchronously as well as on render: an old button handler must
  // not submit between an input edit and React's next render.
  const invalidateQuote = useCallback(() => {
    quoteRevision.current += 1;
    setQuoteVersion(quoteRevision.current);
  }, []);
  const lock = useRef(false);
  const promoRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; promoRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    let active = true;
    void readPurchaseAttempt(userId, event.id).then((saved) => {
      if (active) {
        setAttempt(saved);
        if (saved) {
          setForm({ typeId: saved.body.ticket_type_id, quantity: saved.body.quantity,
            name: saved.body.attendee_name, promo: saved.body.promo_code ?? "" });
          setPromoInput(saved.body.promo_code ?? "");
        }
        setRestoreError(null); setReady(true);
      }
    }).catch(() => {
      if (active) setRestoreError("Couldn't check for an interrupted purchase. Retry before buying, or check My Tickets.");
    });
    return () => { active = false; };
  }, [userId, event.id, restoreVersion]);

  const input = useMemo(() => ({ event_id: event.id, ticket_type_id: form.typeId,
    quantity: form.quantity, promo_code: form.promo || undefined }), [event.id, form.typeId, form.quantity, form.promo]);
  const choice = JSON.stringify(input);
  const invalid = selectionError(event, input);
  const loadQuote = useCallback(async (signal: AbortSignal) => {
    if (invalid || attempt || promoPending || applying || campaignError) return null;
    try {
      const value = await authed((token) => quoteOrder(token, input, signal));
      return { ok: true as const, choice, version: quoteVersion, value, receivedAt: Date.now(), error: null, promoError: null };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't calculate a quote. Please retry.";
      // A quote can also fail for inventory, auth or network reasons. Only
      // backend promo validation errors belong beside the promotion field.
      const promoError = caught instanceof ApiError && caught.status >= 400 && caught.status < 500 &&
        caught.status !== 401 && /promo code/i.test(message)
        ? `${message}. Please correct or remove the promo code.` : null;
      return { ok: false as const, choice, version: quoteVersion, value: null, receivedAt: Date.now(), error: message, promoError };
    }
  }, [attempt, authed, choice, input, invalid, promoPending, applying, campaignError, quoteVersion]);
  const resource = useApiResource(loadQuote);
  const currentQuote = resource.data?.choice === choice && resource.data.version === quoteVersion &&
    !promoPending && !applying && !campaignError ? resource.data : null;
  const reviewed = currentQuote?.ok ? currentQuote : null;
  const quoteError = currentQuote?.error ?? resource.error;
  const promoError = campaignError ?? currentQuote?.promoError ?? null;
  const promoNote = reviewed && !resource.loading && !resource.refreshing && !quoteError && form.promo
    ? `Applied code: ${form.promo}. The discount is included in the quote.` : null;
  const expired = !!reviewed && expiredQuote === currentQuote;
  useEffect(() => {
    if (!currentQuote?.value) return;
    const timer = setTimeout(() => setExpiredQuote(currentQuote), Math.max(0, QUOTE_LIFETIME_MS - (Date.now() - currentQuote.receivedAt)));
    return () => clearTimeout(timer);
  }, [currentQuote]);

  const change = useCallback((patch: Partial<typeof form>) => {
    if (attempt || lock.current || confirmation) return;
    if ("typeId" in patch || "quantity" in patch || "promo" in patch) invalidateQuote();
    setForm((previous) => ({ ...previous, ...patch }));
    setError(null);
  }, [attempt, confirmation, invalidateQuote]);

  const changePromo = useCallback((text: string) => {
    if (attempt || lock.current || confirmation) return;
    promoRequest.current?.abort();
    promoRequest.current = null;
    invalidateQuote();
    setPromoInput(text); setPromoPending(true); setApplying(false);
    setCampaignError(null); setError(null); setInitializingPromo(false);
  }, [attempt, confirmation, invalidateQuote]);

  const applyPromo = useCallback(async (text: string) => {
    if (attempt || lock.current || confirmation) return;
    promoRequest.current?.abort();
    const controller = new AbortController();
    promoRequest.current = controller;
    invalidateQuote();
    setPromoInput(text); setPromoPending(false); setApplying(true);
    setCampaignError(null); setError(null); setInitializingPromo(false);
    try {
      const token = campaignTokenFromInput(text);
      let code = text.trim().toUpperCase();
      if (token) {
        const campaign = await resolveCampaign(token, controller.signal);
        if (campaign.event_id !== event.id) throw new Error("This campaign belongs to a different event.");
        code = campaign.promo_code;
      }
      if (!controller.signal.aborted && mounted.current) {
        setForm((previous) => ({ ...previous, promo: code }));
      }
    } catch (caught) {
      if (!controller.signal.aborted && mounted.current) {
        setCampaignError(`${caught instanceof Error ? caught.message : "Couldn't apply this promotion."} Please correct or remove the promo code.`);
      }
    } finally {
      if (promoRequest.current === controller && mounted.current) {
        promoRequest.current = null;
        setApplying(false);
      }
    }
  }, [attempt, confirmation, event.id, invalidateQuote]);

  useEffect(() => {
    if (!promoPending) return;
    const timer = setTimeout(() => {
      if (quoteVersion === quoteRevision.current) void applyPromo(promoInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [applyPromo, promoInput, promoPending, quoteVersion]);

  useEffect(() => {
    if (!ready || openedCampaign.current || !initialCampaignToken) return;
    openedCampaign.current = true;
    void applyPromo(initialCampaignToken).finally(() => { if (mounted.current) setInitializingPromo(false); });
  }, [applyPromo, initialCampaignToken, ready]);

  const nameValid = form.name.trim().length > 0 && Array.from(form.name.trim()).length <= 120;
  const canBuy = ready && !restoreError && !busy && !applying && !initializingPromo && !confirmation &&
    (!!attempt || (!promoPending && !promoError && !invalid && !!reviewed && !expired && !resource.loading && !resource.refreshing && !quoteError && nameValid));

  async function purchase() {
    if (lock.current || !canBuy || quoteVersion !== quoteRevision.current) return;
    const release = acquirePurchaseLock(userId, event.id);
    if (!release) { setError("A purchase for this event is still processing. Check My Tickets and retry after it finishes."); return; }
    lock.current = true; setBusy(true); setError(null);
    let pending = attempt;
    try {
      const saved = await readPurchaseAttempt(userId, event.id);
      if (!mounted.current) return;
      if (!pending && saved) {
        setAttempt(saved);
        setForm({ typeId: saved.body.ticket_type_id, quantity: saved.body.quantity,
          name: saved.body.attendee_name, promo: saved.body.promo_code ?? "" });
        setError("An interrupted purchase was found. Review its saved details and retry it safely.");
        return;
      }
      if (!pending) {
        if (!reviewed || Date.now() - reviewed.receivedAt >= QUOTE_LIFETIME_MS) {
          throw new Error("This quote expired. Refresh the quote before purchasing.");
        }
        // Quotes do not reserve inventory or price. Revalidate immediately before submitting.
        const latest = await authed((token) => quoteOrder(token, input));
        if (!mounted.current) return;
        if (quoteVersion !== quoteRevision.current) return;
        if (!sameQuote(reviewed.value, latest)) {
          throw new Error("The price changed. Review the new quote and tap Buy again.");
        }
        // Checkout's native dependency must not prevent login, tickets or staff
        // tools from starting when an older host app lacks the crypto module.
        let key: string;
        try {
          const { randomUUID } = await import("expo-crypto");
          key = randomUUID();
        } catch {
          throw new Error("Purchasing isn't available in this app build. Update the app or use a development build, then retry.");
        }
        if (!mounted.current || quoteVersion !== quoteRevision.current) return;
        pending = { key, body: { ...input, attendee_name: form.name.trim(), simulate_payment: "success" } };
        // Persist BEFORE sending a mutation, so navigation/relaunch cannot lose a retry key.
        await savePurchaseAttempt(userId, pending);
        if (!mounted.current) return;
        setAttempt(pending);
      }
      const result = await authed((token) => checkoutOrder(token, pending!.body, pending!.key));
      if (result.order?.id && ["refunded", "cancelled", "failed"].includes(result.order.status)) {
        throw new ApiError(`The saved order is ${result.order.status}. No new purchase was made. Review My Tickets before starting another purchase.`, 409);
      }
      if (result.order?.status !== "paid" || !result.order.id || !result.tickets?.length || result.tickets.some((t) => !t.id)) {
        throw new Error("The server did not confirm a paid order with tickets. Check My Tickets or retry this saved attempt safely.");
      }
      if (mounted.current) setConfirmation(result);
      // If storage cleanup fails, a later retry still returns the same order, never a new purchase.
      await clearPurchaseAttempt(userId, event.id).catch(() => undefined);
      if (mounted.current) setAttempt(null);
    } catch (caught) {
      const definitive = caught instanceof ApiError && caught.status >= 400 && caught.status < 500 &&
        caught.status !== 401 && !/busy|try again/i.test(caught.message);
      if (pending && definitive) {
        try {
          await clearPurchaseAttempt(userId, event.id);
          if (mounted.current) setAttempt(null);
        } catch { /* Keep the retry key when storage cannot be updated. */ }
      }
      if (mounted.current) {
        setError(caught instanceof Error ? caught.message : "Purchase could not be confirmed. Retry safely or check My Tickets.");
        if (!pending || definitive) invalidateQuote();
      }
    } finally {
      release();
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const retryQuote = useCallback(() => {
    if (!lock.current && !attempt && !confirmation) invalidateQuote();
  }, [attempt, confirmation, invalidateQuote]);
  const quotes = { ...resource, error: quoteError, retry: retryQuote, refresh: retryQuote };
  return { form, change, promoInput, changePromo, applyPromo, promoNote, promoError, promoPending, applying, invalid, reviewed, expired, quotes,
    attempt, ready, restoreError, retryRestore: () => setRestoreVersion((n) => n + 1),
    error, busy, confirmation, canBuy, purchase };
}
