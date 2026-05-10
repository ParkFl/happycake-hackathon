/**
 * site/lib/mcp.ts — typed Happy Cake MCP client.
 *
 * Schemas verified against the live sandbox. See docs/MCP_SCHEMAS.md
 * and research/mcp-schema-dump.json for source-of-truth shapes.
 *
 * Critical conventions:
 *  - All money is in cents. Use formatPrice() for UI.
 *  - Square uses variationId, Kitchen uses productId. Different keys!
 *  - All status values are lowercase.
 *  - Marketing requires: name, channel, objective, targetAudience, offer.
 *
 * In production, swap the implementation of `mcpCall` for real Square /
 * WhatsApp / IG / GBP API clients. Function signatures stay identical.
 */

const MCP_URL = process.env.HAPPYCAKE_MCP_URL ?? "https://www.steppebusinessclub.com/api/mcp";
const TEAM_TOKEN = process.env.HAPPYCAKE_TEAM_TOKEN!;

if (!TEAM_TOKEN) {
  throw new Error("HAPPYCAKE_TEAM_TOKEN is not set in env");
}

/* ---------- Types ---------- */

export type CatalogItem = {
  id: string;                 // sq_item_*
  variationId: string;        // sq_var_* — used by square_create_order
  name: string;
  category: "slices" | "whole-cakes" | "custom" | "catering";
  priceCents: number;
  description: string;
  kitchenProductId: string;   // used by kitchen_create_ticket as `productId`
};

export type OrderStatus = "open" | "in_kitchen" | "ready" | "completed" | "cancelled";
export type TicketStatus = "queued" | "accepted" | "rejected" | "ready" | "completed";

export type Order = {
  id: string;                 // sq_order_*
  source: "agent" | "walkin" | string;
  customerName: string;
  customerPhone?: string;
  items: Array<{
    variationId: string;
    quantity: number;
    name: string;
    priceCents: number;
    kitchenProductId: string;
  }>;
  totalCents: number;
  status: OrderStatus;
  kitchenHandoffRecommended: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KitchenSummary = {
  tickets: number;
  byStatus: Record<string, number>;
  events: number;
  dailyCapacityMinutes: number;
  usedPrepMinutes: number;
  remainingCapacityMinutes: number;
  overCapacity: boolean;
};

export type KitchenTicket = {
  id: string;                 // kt_*
  orderId: string;
  customerName: string;
  items: Array<{ productId: string; quantity: number }>;
  status: TicketStatus;
  estimatedPrepMinutes: number;
  estimatedReadyAt: string;
  createdAt: string;
};

export type CampaignChannel = "instagram" | "google_ads" | "meta_ads" | "google_local" | "website" | string;

export type CampaignDraft = {
  name: string;
  channel: CampaignChannel;
  objective: string;
  targetAudience: string;
  offer: string;
  budgetUsd?: number;
};

/* ---------- Low-level call ---------- */

let nextRpcId = 1;

async function mcpCall<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
  const id = nextRpcId++;
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Team-Token": TEAM_TOKEN,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new McpError(`MCP HTTP ${res.status} for ${toolName}`, toolName, args);
  }

  const json = await res.json();
  if (json.error) throw new McpError(json.error.message, toolName, args);

  // Tool results are wrapped: { result: { content: [{ type: "text", text: "<json string or error>" }], isError? } }
  const content = json.result?.content?.[0];
  const text = content?.text ?? "";

  if (json.result?.isError || text.startsWith("Error:")) {
    throw new McpToolError(text, toolName, args);
  }

  // Most tools return JSON-stringified payloads in the text field.
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some tools may return plain text; cast and let caller handle.
    return text as unknown as T;
  }
}

export class McpError extends Error {
  constructor(message: string, public toolName: string, public args: Record<string, unknown>) {
    super(`[mcp:${toolName}] ${message}`);
  }
}

export class McpToolError extends McpError {
  /** Parses the "Error: a, b, and c are required" pattern into the missing field list. */
  missingRequiredFields(): string[] {
    const m = this.message.match(/Error: (.+) (?:are|is) required/i);
    if (!m) return [];
    return m[1]
      .replace(/,?\s+and\s+/g, ", ")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

/* ---------- High-level API ---------- */

let catalogCache: { at: number; items: CatalogItem[] } | null = null;
const CATALOG_TTL_MS = 60_000;

export async function listCatalog(opts: { fresh?: boolean } = {}): Promise<CatalogItem[]> {
  const now = Date.now();
  if (!opts.fresh && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.items;
  }
  const result = await mcpCall<{ catalog: CatalogItem[]; mode: string }>("square_list_catalog");
  catalogCache = { at: now, items: result.catalog };
  return result.catalog;
}

export async function getCatalogItemBySlug(slug: string): Promise<CatalogItem | undefined> {
  // Slugs we expose on the website map to kitchenProductId for stability.
  const items = await listCatalog();
  return items.find((it) => it.kitchenProductId === slug);
}

export async function createOrder(input: {
  items: Array<{ variationId: string; quantity: number }>;
  customerPhone: string;
  customerName: string;
}): Promise<{ order: Order; kitchenTool: string }> {
  return mcpCall("square_create_order", input);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<unknown> {
  return mcpCall("square_update_order_status", { orderId, status });
}

export async function getPosSummary() {
  return mcpCall<{
    mode: string;
    orders: number;
    revenueCents: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    events: number;
    kitchenHandoffRecommended: number;
  }>("square_get_pos_summary");
}

export async function getKitchenSummary(): Promise<KitchenSummary> {
  return mcpCall("kitchen_get_production_summary");
}

export type InventoryCount = {
  variationId: string;
  quantity: number;
  unit: string;
};

export async function getInventory(variationIds: string[]): Promise<InventoryCount[]> {
  const result = await mcpCall<{ counts?: InventoryCount[] }>("square_get_inventory", { variationIds });
  return result?.counts ?? [];
}

/** Returns the inventory count for a single variationId, or null if unknown. */
export async function getInventoryForVariation(variationId: string): Promise<InventoryCount | null> {
  const counts = await getInventory([variationId]);
  return counts.find((c) => c.variationId === variationId) ?? null;
}

export async function createKitchenTicket(input: {
  orderId: string;
  customerName: string;
  items: Array<{ productId: string; quantity: number }>; // NB: productId, not variationId
}): Promise<{ ticketId: string; status: TicketStatus; ticket: KitchenTicket }> {
  return mcpCall("kitchen_create_ticket", input);
}

export async function acceptKitchenTicket(ticketId: string, estimatedMinutes: number) {
  return mcpCall("kitchen_accept_ticket", { ticketId, estimatedMinutes });
}

export async function rejectKitchenTicket(ticketId: string, reason: string) {
  return mcpCall("kitchen_reject_ticket", { ticketId, reason });
}

export async function createCampaign(draft: CampaignDraft) {
  return mcpCall("marketing_create_campaign", draft);
}

export async function launchCampaign(campaignId: string) {
  return mcpCall("marketing_launch_simulated_campaign", { campaignId });
}

export async function generateLeads(campaignId: string) {
  return mcpCall<{
    generated: number;
    leads: Array<{
      id: string;
      campaignId: string;
      customerName: string;
      channel: CampaignChannel;
      intent: string;
      estimatedOrderValueUsd: number;
    }>;
  }>("marketing_generate_leads", { campaignId });
}

export async function reportMarketingToOwner() {
  return mcpCall("marketing_report_to_owner");
}

export async function getEvidenceSummary() {
  return mcpCall<{
    policy: string;
    websiteArtifact: string;
    counts: Record<string, number>;
  }>("evaluator_get_evidence_summary");
}

export async function generateTeamReport() {
  return mcpCall<{
    score: number;
    maxScore: number;
    dimensions: Array<{
      dimension: string;
      score: number;
      maxScore: number;
      evidence: string[];
      gaps: string[];
    }>;
    nextJudgeChecks: string[];
  }>("evaluator_generate_team_report");
}

/* ---------- UI helpers ---------- */

export function formatPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)}`;
}

export function isCustomCategory(item: CatalogItem): boolean {
  return item.category === "custom";
}

/* ---------- Capacity arithmetic ---------- */

export async function canAcceptTicket(estimatedPrepMinutes: number): Promise<boolean> {
  const k = await getKitchenSummary();
  return k.remainingCapacityMinutes >= estimatedPrepMinutes && !k.overCapacity;
}
