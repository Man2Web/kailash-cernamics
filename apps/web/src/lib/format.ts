// UI formatting helpers. The maths lives in @gc/shared so web and API compute identical numbers.
export {
  formatINR,
  formatIndian,
  formatDate,
  formatDateTime,
  formatQty,
  formatBoxes,
  rupeesToPaise,
  paiseToRupees,
  toDateInput,
  labelOf,
  amountInWords,
} from "@gc/shared";

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}
