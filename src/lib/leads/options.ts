// Choice lists for leads, shared by the form, the list and the server actions. `value` is what is stored.

export interface LeadOption {
  value: string;
  label: string;
}

export const LEAD_SOURCES: LeadOption[] = [
  { value: "WALK_IN", label: "Walk-in" },
  { value: "PHONE_CALL", label: "Phone call" },
];

export const LEAD_STATUSES: LeadOption[] = [
  { value: "NEW", label: "New" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CONVERTED", label: "Converted" },
  { value: "LOST", label: "Lost" },
];

export const LEAD_PROJECT_TYPES: LeadOption[] = [
  { value: "NEW_CONSTRUCTION", label: "New house / building" },
  { value: "RENOVATION", label: "Renovation" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "OTHER", label: "Other" },
];

export const LEAD_TIMELINES: LeadOption[] = [
  { value: "IMMEDIATE", label: "Immediately" },
  { value: "WITHIN_1_MONTH", label: "Within 1 month" },
  { value: "ONE_TO_THREE_MONTHS", label: "1–3 months" },
  { value: "JUST_ENQUIRING", label: "Just enquiring" },
];

export const LEAD_HEARD_FROM: LeadOption[] = [
  { value: "REFERRAL", label: "Referral" },
  { value: "GOOGLE", label: "Google" },
  { value: "SOCIAL_MEDIA", label: "Social media" },
  { value: "PASSING_BY", label: "Passing by" },
  { value: "EXISTING_CUSTOMER", label: "Existing customer" },
  { value: "OTHER", label: "Other" },
];

export function optionLabel(list: LeadOption[], value?: string | null): string {
  if (!value) return "—";
  return list.find((o) => o.value === value)?.label || value;
}
