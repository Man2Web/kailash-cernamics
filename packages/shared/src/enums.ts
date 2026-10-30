// Enum values shared by web and api. Keep in sync with prisma/schema.prisma.

export const CATEGORY_TYPES = ["TILE", "SANITARY", "CP_FITTING", "ACCESSORY", "ADHESIVE"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const UOM_TYPES = ["PIECE_BOX_AREA", "UNIT"] as const;
export type UomType = (typeof UOM_TYPES)[number];

export const GRADES = ["PREMIUM", "STANDARD", "COMMERCIAL"] as const;
export type Grade = (typeof GRADES)[number];

export const STOCK_TYPES = ["SALEABLE", "DISPLAY", "DAMAGED", "RESERVED", "IN_TRANSIT", "SAMPLE"] as const;
export type StockType = (typeof STOCK_TYPES)[number];

export const SEGMENTS = ["RETAIL", "CONTRACTOR", "DEALER", "BUILDER", "INSTITUTION", "CLEARANCE"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const PRICE_BASES = ["PER_SQFT", "PER_BOX", "PER_UNIT"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

export const PARTY_TYPES = ["CUSTOMER", "SUPPLIER", "BOTH"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const INFLUENCER_TYPES = ["ARCHITECT", "INTERIOR", "PLUMBER", "MASON"] as const;
export type InfluencerType = (typeof INFLUENCER_TYPES)[number];

export const BREAKAGE_STAGES = ["RECEIPT", "GODOWN", "TRANSIT", "CUSTOMER"] as const;
export type BreakageStage = (typeof BREAKAGE_STAGES)[number];

export const DOC_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED", "PARTIAL", "COMPLETED", "CANCELLED"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TYPES = ["DISCOUNT", "CREDIT", "ADJUSTMENT", "WRITE_OFF"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const AREA_TYPES = ["FLOOR", "WALL", "SKIRTING", "HIGHLIGHTER"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const PAYMENT_MODES = ["CASH", "UPI", "CHEQUE", "NEFT", "CARD"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const CHEQUE_STATUSES = ["PENDING", "DEPOSITED", "CLEARED", "BOUNCED"] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

export const SYNC_DIRECTIONS = ["TO_TALLY", "FROM_TALLY"] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export const SYNC_STATUSES = ["PENDING", "SENT", "SUCCESS", "FAILED"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const TALLY_SYNC_STATES = ["NOT_QUEUED", "PENDING", "SYNCED", "FAILED"] as const;
export type TallySyncState = (typeof TALLY_SYNC_STATES)[number];

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ALLOCATION_BASES = ["VALUE", "WEIGHT"] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

export const SCHEME_TARGET_TYPES = ["VALUE", "SQFT"] as const;
export type SchemeTargetType = (typeof SCHEME_TARGET_TYPES)[number];

/** Where a tile is used (product.applications). */
export const TILE_APPLICATIONS = ["FLOOR", "WALL", "PARKING", "ELEVATION", "KITCHEN", "BATHROOM", "OUTDOOR", "STEP"] as const;
export type TileApplication = (typeof TILE_APPLICATIONS)[number];

export const TRANSIT_STATES = ["IN_TRANSIT", "RECEIVED"] as const;
export const SAMPLE_STATUSES = ["OPEN", "PARTIAL", "CLOSED"] as const;
export const COUNT_STATUSES = ["DRAFT", "COUNTING", "PENDING_APPROVAL", "POSTED", "CANCELLED"] as const;
export const CLAIM_STATUSES = ["DRAFT", "SUBMITTED", "SETTLED", "REJECTED"] as const;

export const DOC_TYPES = [
  "QUOTATION",
  "SALES_ORDER",
  "INVOICE",
  "CHALLAN",
  "SALES_RETURN",
  "CREDIT_NOTE",
  "PURCHASE_ORDER",
  "GRN",
  "PURCHASE_INVOICE",
  "DEBIT_NOTE",
  "RECEIPT",
  "PAYMENT",
  "TRANSFER",
  "ADJUSTMENT",
  "BREAKAGE",
  "STOCK_COUNT",
  "SAMPLE_ISSUE",
  "BREAKAGE_CLAIM",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Default prefix per document type, used in number series like KC/CBE/26-27/0001. */
export const DOC_PREFIX: Record<DocType, string> = {
  QUOTATION: "QT",
  SALES_ORDER: "SO",
  INVOICE: "KC",
  CHALLAN: "DC",
  SALES_RETURN: "SR",
  CREDIT_NOTE: "CN",
  PURCHASE_ORDER: "PO",
  GRN: "GRN",
  PURCHASE_INVOICE: "PI",
  DEBIT_NOTE: "DN",
  RECEIPT: "RC",
  PAYMENT: "PY",
  TRANSFER: "ST",
  ADJUSTMENT: "SA",
  BREAKAGE: "BK",
  STOCK_COUNT: "PC",
  SAMPLE_ISSUE: "SM",
  BREAKAGE_CLAIM: "BC",
};

/** Human labels for enum values in the UI. */
export function labelOf(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split("_")
    .map((w) => (w === "cp" || w === "gst" || w === "upi" || w === "neft" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
