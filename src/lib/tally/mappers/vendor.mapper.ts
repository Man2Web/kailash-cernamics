import { buildLedgerXml, wrapTallyEnvelope } from "../xml-builder";

export interface VendorSyncData {
  id: string;
  name: string;
  code: string;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  outstandingAmt?: number | null;
  addresses?: Array<{
    type: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  }>;
  creditorGroup?: string;
}

export function mapVendorToTallyLedger(vendor: VendorSyncData, companyName?: string) {
  const primaryAddress =
    vendor.addresses?.find((a) => a.type === "BILLING") || vendor.addresses?.[0];

  const fullAddressLines: string[] = [];
  if (primaryAddress) {
    if (primaryAddress.address) fullAddressLines.push(primaryAddress.address);
    if (primaryAddress.city) fullAddressLines.push(primaryAddress.city);
    if (primaryAddress.state && primaryAddress.pincode) {
      fullAddressLines.push(`${primaryAddress.state} - ${primaryAddress.pincode}`);
    }
  }

  const ledgerXml = buildLedgerXml({
    name: vendor.name,
    parent: vendor.creditorGroup || "Sundry Creditors",
    gstin: vendor.gstin,
    email: vendor.email,
    phone: vendor.phone,
    address: fullAddressLines.length > 0 ? fullAddressLines.join("\n") : null,
    state: primaryAddress?.state || null,
    country: "India",
    pincode: primaryAddress?.pincode || null,
    openingBalance: vendor.outstandingAmt ? Number(vendor.outstandingAmt) : 0,
    guid: vendor.id,
  });

  const fullXml = wrapTallyEnvelope(ledgerXml, companyName);

  return {
    ledgerName: vendor.name,
    guid: vendor.id,
    ledgerXml,
    fullXml,
  };
}
