export interface GstCalculationResult {
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

/**
 * Computes GST tax details for a single line item.
 * 
 * @param rate - Base unit rate
 * @param quantity - Quantity purchased
 * @param discount - Discount amount (absolute) or percentage
 * @param baseGstRate - Total GST rate percentage (e.g. 18.00)
 * @param sellerState - State code of the branch/outlet
 * @param buyerState - State code of the delivery/billing address
 * @param isInclusive - Whether the rate is inclusive of GST
 */
export function calculateGst({
  rate,
  quantity,
  discount = 0,
  baseGstRate = 18,
  sellerState,
  buyerState,
  isInclusive = false,
}: {
  rate: number;
  quantity: number;
  discount?: number;
  baseGstRate?: number;
  sellerState: string;
  buyerState: string;
  isInclusive?: boolean;
}): GstCalculationResult {
  const rawTotal = rate * quantity;
  // Apply absolute discount
  const afterDiscount = Math.max(0, rawTotal - discount);

  let taxableAmount = afterDiscount;
  if (isInclusive) {
    // If rate is inclusive: Taxable = Gross / (1 + GST_Rate / 100)
    taxableAmount = afterDiscount / (1 + baseGstRate / 100);
  }

  const taxAmount = afterDiscount - (isInclusive ? taxableAmount : taxableAmount * (baseGstRate / 100));
  const finalTax = isInclusive ? taxAmount : taxableAmount * (baseGstRate / 100);

  // Check state to apply CGST/SGST or IGST
  const isIntrastate = sellerState.toLowerCase().trim() === buyerState.toLowerCase().trim();

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isIntrastate) {
    // CGST + SGST (split the total GST rate in half)
    cgstRate = baseGstRate / 2;
    cgstAmount = finalTax / 2;
    sgstRate = baseGstRate / 2;
    sgstAmount = finalTax / 2;
  } else {
    // IGST (full rate applied)
    igstRate = baseGstRate;
    igstAmount = finalTax;
  }

  const totalAmount = isInclusive ? afterDiscount : taxableAmount + finalTax;

  return {
    taxableAmount: parseFloat(taxableAmount.toFixed(2)),
    cgstRate: parseFloat(cgstRate.toFixed(2)),
    cgstAmount: parseFloat(cgstAmount.toFixed(2)),
    sgstRate: parseFloat(sgstRate.toFixed(2)),
    sgstAmount: parseFloat(sgstAmount.toFixed(2)),
    igstRate: parseFloat(igstRate.toFixed(2)),
    igstAmount: parseFloat(igstAmount.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
  };
}
