import { apiRequest } from "./client";

export interface ResolvedCampaign { event_id: string; promo_code: string }

export function resolveCampaign(token: string, signal?: AbortSignal): Promise<ResolvedCampaign> {
  return apiRequest(`/api/campaigns/resolve?token=${encodeURIComponent(token)}`, { signal });
}

/** Campaign links are data only. Never fetch or trust a pasted external URL. */
export function campaignTokenFromInput(input: string): string | null {
  const text = input.trim();
  if (text.startsWith("cmp_")) return text;
  if (!/^https?:\/\//i.test(text)) return null;
  const url = new URL(text);
  const token = url.searchParams.get("c");
  if (!token) throw new Error("This link has no campaign token.");
  return token;
}
