"""
bots/shared/schemas.py — Pydantic models for the happycake MCP.

Source of truth: docs/MCP_SCHEMAS.md (verified against live sandbox).

Why these exist:
- Python is dynamically typed; without these, a typo like `productId` vs
  `variationId` only fails at runtime against the MCP server.
- Pydantic enforces camelCase on the wire while letting Python code use
  snake_case via aliases.
- IDE autocomplete + mypy catch most mistakes before they hit the sandbox.

Wrappers should accept these models as input/output, not raw dicts.
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

# ---------- Shared base ----------

class _CamelModel(BaseModel):
    """Base that emits camelCase JSON while allowing snake_case Python attrs."""
    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow",   # Sandbox may add fields between versions; don't fail.
    )


OrderStatus = Literal["open", "in_kitchen", "ready", "completed", "cancelled"]
TicketStatus = Literal["queued", "accepted", "rejected", "ready", "completed"]
CatalogCategory = Literal["slices", "whole-cakes", "custom", "catering"]
CampaignChannel = str  # values seen: instagram, google_local, website, google_ads, meta_ads


# ---------- Square (POS) ----------

class CatalogItem(_CamelModel):
    id: str
    variation_id: str = Field(alias="variationId")
    name: str
    category: CatalogCategory
    price_cents: int = Field(alias="priceCents")
    description: str
    kitchen_product_id: str = Field(alias="kitchenProductId")

    @property
    def price_usd(self) -> float:
        return self.price_cents / 100

    @property
    def requires_owner_approval(self) -> bool:
        return self.category == "custom"


class SquareListCatalogResponse(_CamelModel):
    mode: str
    catalog: list[CatalogItem]


class CreateOrderItem(_CamelModel):
    """For square_create_order — uses VARIATION id (NOT productId)."""
    variation_id: str = Field(alias="variationId")
    quantity: int


class CreateOrderRequest(_CamelModel):
    items: list[CreateOrderItem]
    customer_phone: str = Field(alias="customerPhone")
    customer_name: str = Field(alias="customerName")


class OrderItem(_CamelModel):
    variation_id: str = Field(alias="variationId")
    quantity: int
    name: str
    price_cents: int = Field(alias="priceCents")
    kitchen_product_id: str = Field(alias="kitchenProductId")


class Order(_CamelModel):
    id: str
    source: str  # "agent" | "walkin" | ...
    customer_name: str = Field(alias="customerName")
    customer_phone: Optional[str] = Field(default=None, alias="customerPhone")
    items: list[OrderItem]
    total_cents: int = Field(alias="totalCents")
    status: OrderStatus
    kitchen_handoff_recommended: bool = Field(alias="kitchenHandoffRecommended")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class CreateOrderResponse(_CamelModel):
    mode: str
    order: Order
    kitchen_tool: str = Field(alias="kitchenTool")  # next tool to call


class UpdateOrderStatusRequest(_CamelModel):
    order_id: str = Field(alias="orderId")
    status: OrderStatus  # MUST be lowercase enum value


class PosSummary(_CamelModel):
    mode: str
    orders: int
    revenue_cents: int = Field(alias="revenueCents")
    by_status: dict[str, int] = Field(alias="byStatus")
    by_source: dict[str, int] = Field(alias="bySource")
    events: int
    kitchen_handoff_recommended: int = Field(alias="kitchenHandoffRecommended")


# ---------- Kitchen ----------

class KitchenSummary(_CamelModel):
    tickets: int
    by_status: dict[str, int] = Field(alias="byStatus")
    events: int
    daily_capacity_minutes: int = Field(alias="dailyCapacityMinutes")
    used_prep_minutes: int = Field(alias="usedPrepMinutes")
    remaining_capacity_minutes: int = Field(alias="remainingCapacityMinutes")
    over_capacity: bool = Field(alias="overCapacity")


class KitchenTicketItem(_CamelModel):
    """For kitchen_create_ticket — uses PRODUCT id (NOT variationId)."""
    product_id: str = Field(alias="productId")
    quantity: int


class CreateKitchenTicketRequest(_CamelModel):
    order_id: str = Field(alias="orderId")
    customer_name: str = Field(alias="customerName")
    items: list[KitchenTicketItem]


class KitchenTicket(_CamelModel):
    id: str
    order_id: str = Field(alias="orderId")
    customer_name: str = Field(alias="customerName")
    items: list[KitchenTicketItem]
    status: TicketStatus
    estimated_prep_minutes: int = Field(alias="estimatedPrepMinutes")
    estimated_ready_at: str = Field(alias="estimatedReadyAt")
    created_at: str = Field(alias="createdAt")


class CreateKitchenTicketResponse(_CamelModel):
    ticket_id: str = Field(alias="ticketId")
    status: TicketStatus
    ticket: KitchenTicket


class AcceptKitchenTicketRequest(_CamelModel):
    ticket_id: str = Field(alias="ticketId")
    estimated_minutes: int = Field(alias="estimatedMinutes")


class RejectKitchenTicketRequest(_CamelModel):
    ticket_id: str = Field(alias="ticketId")
    reason: str


# ---------- Marketing ----------

class CreateCampaignRequest(_CamelModel):
    """All five fields are required — sandbox returns
    'Error: name, channel, objective, targetAudience, and offer are required'
    if any is missing."""
    name: str
    channel: CampaignChannel  # NB: 'channel', not 'platform'
    objective: str
    target_audience: str = Field(alias="targetAudience")
    offer: str
    budget_usd: Optional[float] = Field(default=None, alias="budgetUsd")


class Lead(_CamelModel):
    id: str
    campaign_id: str = Field(alias="campaignId")
    customer_name: str = Field(alias="customerName")
    channel: CampaignChannel
    intent: str
    estimated_order_value_usd: float = Field(alias="estimatedOrderValueUsd")


class GenerateLeadsResponse(_CamelModel):
    generated: int
    leads: list[Lead]


class MarketingReport(_CamelModel):
    budget_usd: float = Field(alias="budgetUsd")
    target_effect_usd: float = Field(alias="targetEffectUsd")
    campaigns_created: int = Field(alias="campaignsCreated")
    launches: int
    leads_generated: int = Field(alias="leadsGenerated")
    leads_routed: int = Field(alias="leadsRouted")
    adjustments: int
    projected_revenue_usd: float = Field(alias="projectedRevenueUsd")
    owner_summary: str = Field(alias="ownerSummary")
    reported_at: str = Field(alias="reportedAt")


# ---------- Evaluator ----------

class EvidenceCounts(_CamelModel):
    world_events: int = Field(alias="worldEvents")
    marketing_campaigns: int = Field(alias="marketingCampaigns")
    marketing_leads: int = Field(alias="marketingLeads")
    square_orders: int = Field(alias="squareOrders")
    kitchen_tickets: int = Field(alias="kitchenTickets")
    whatsapp_inbound: int = Field(alias="whatsappInbound")
    whatsapp_outbound: int = Field(alias="whatsappOutbound")
    instagram_actions: int = Field(alias="instagramActions")
    gbusiness_reviews: int = Field(alias="gbusinessReviews")
    gbusiness_replies: int = Field(alias="gbusinessReplies")
    audit_calls: int = Field(alias="auditCalls")


class EvidenceSummary(_CamelModel):
    policy: str
    website_artifact: str = Field(alias="websiteArtifact")
    counts: EvidenceCounts


class TeamReportDimension(_CamelModel):
    dimension: str
    score: int
    max_score: int = Field(alias="maxScore")
    evidence: list[str]
    gaps: list[str]


class TeamReport(_CamelModel):
    score: int
    max_score: int = Field(alias="maxScore")
    dimensions: list[TeamReportDimension]
    next_judge_checks: list[str] = Field(alias="nextJudgeChecks")


# ---------- Internal: approval queue ----------

class ApprovalItem(_CamelModel):
    """An item awaiting owner approval in Telegram. Used by all wrappers."""
    id: str
    kind: Literal[
        "social_post",
        "marketing_campaign_launch",
        "custom_order",
        "review_reply",
        "complaint_resolution",
    ]
    summary: str
    payload: dict
    created_at: str
    channel: Optional[str] = None
    customer: Optional[str] = None


# ---------- Helpers ----------

def map_variation_to_kitchen_product(catalog: list[CatalogItem], variation_id: str) -> str:
    """The cross-key lookup: Square uses variationId, Kitchen uses productId.
    This is the single most common mistake we want type-checking to prevent."""
    for item in catalog:
        if item.variation_id == variation_id:
            return item.kitchen_product_id
    raise ValueError(f"variationId {variation_id} not in catalog")


def format_price(price_cents: int) -> str:
    return f"${price_cents / 100:.2f}"
