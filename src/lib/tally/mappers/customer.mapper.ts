import { buildLedgerXml, wrapTallyEnvelope } from "../xml-builder";

export interface CustomerSyncData {
  id: string;
  name: string;
  code: string;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  creditLimit?: number | null;
  outstandingAmt?: number | null;
  addresses?: Array<{
    type: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    area?: string | null;
    isDefault?: boolean;
  }>;
  debtorGroup?: string;
}

export function mapCustomerToTallyLedger(customer: CustomerSyncData, companyName?: string) {
  // Find primary billing or default address
  const primaryAddress =
    customer.addresses?.find((a) => a.type === "BILLING" || a.isDefault) ||
    customer.addresses?.[0];

  const fullAddressLines: string[] = [];
  if (primaryAddress) {
    if (primaryAddress.address) fullAddressLines.push(primaryAddress.address);
    if (primaryAddress.area) fullAddressLines.push(primaryAddress.area);
    if (primaryAddress.city) fullAddressLines.push(primaryAddress.city);
    if (primaryAddress.state && primaryAddress.pincode) {
      fullAddressLines.push(`${primaryAddress.state} - ${primaryAddress.pincode}`);
    }
  }

  const ledgerXml = buildLedgerXml({
    name: customer.name,
    parent: customer.debtorGroup || "Sundry Debtors",
    gstin: customer.gstin,
    email: customer.email,
    phone: customer.phone,
    address: fullAddressLines.length > 0 ? fullAddressLines.join("\n") : null,
    state: primaryAddress?.state || null,
    country: "India",
    pincode: primaryAddress?.pincode || null,
    creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
    openingBalance: customer.outstandingAmt ? Number(customer.outstandingAmt) : 0,
    guid: customer.id,
  });

  const fullXml = wrapTallyEnvelope(ledgerXml, companyName);

  return {
    ledgerName: customer.name,
    guid: customer.id,
    ledgerXml,
    fullXml,
  };
}
