import { describe, expect, it } from "vitest";
import { ALL_FEATURE_KEYS, FEATURE_PARTS, FEATURES, featureForPage, featureForRoute, featureOn, ROUTE_FEATURE } from "./features";

describe("feature switches", () => {
  const allOn = Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, true]));

  it("a part is on only when its own switch and its module are on", () => {
    expect(featureOn(allOn, "sales.invoices")).toBe(true);
    expect(featureOn({ ...allOn, "sales.invoices": false }, "sales.invoices")).toBe(false);
    expect(featureOn({ ...allOn, "sales.invoices": false }, "sales.quotations")).toBe(true);
    expect(featureOn({ ...allOn, sales: false }, "sales.quotations")).toBe(false);
    expect(featureOn({ ...allOn, sales: false }, "crm.leads")).toBe(true);
  });

  it("anything with no saved value is on", () => {
    expect(featureOn({}, "sales.invoices")).toBe(true);
    expect(featureOn({}, "tally")).toBe(true);
  });

  it("every part belongs to a real module and every key is unique", () => {
    const modules = FEATURES.map((f) => f.key as string);
    for (const p of FEATURE_PARTS) expect(modules).toContain(p.module);
    expect(new Set(ALL_FEATURE_KEYS).size).toBe(ALL_FEATURE_KEYS.length);
  });

  it("the five sales parts are separate, as the Super Admin asked", () => {
    expect(featureForRoute("/api/quotations")).toBe("sales.quotations");
    expect(featureForRoute("/api/sales-orders")).toBe("sales.orders");
    expect(featureForRoute("/api/invoices/abc/post")).toBe("sales.invoices");
    expect(featureForRoute("/api/challans")).toBe("sales.challans");
    expect(featureForRoute("/api/dispatches/x/deliver")).toBe("sales.challans");
    expect(featureForRoute("/api/sales-returns")).toBe("sales.returns");
    expect(featureForRoute("/api/credit-notes")).toBe("sales.returns");
  });

  it("an action that creates another document is behind that document's switch", () => {
    expect(featureForRoute("/api/sales-orders/abc/invoice")).toBe("sales.invoices");
    expect(featureForRoute("/api/quotations/abc/convert")).toBe("sales.orders");
    expect(featureForRoute("/api/leads/abc/convert")).toBe("sales.quotations");
  });

  it("stock routes split into stock, transfers, adjustments, counts and breakage", () => {
    expect(featureForRoute("/api/stock/ledger")).toBe("inventory.stock");
    expect(featureForRoute("/api/stock/transfers/1/receive")).toBe("inventory.transfers");
    expect(featureForRoute("/api/stock/adjustments")).toBe("inventory.adjustments");
    expect(featureForRoute("/api/stock/counts/1/lines")).toBe("inventory.counts");
    expect(featureForRoute("/api/stock/breakage")).toBe("inventory.breakage");
  });

  it("foundation routes are always available", () => {
    for (const p of ["/api/products", "/api/parties", "/api/users", "/api/features", "/api/auth/login", "/api/approvals"]) expect(featureForRoute(p)).toBeUndefined();
  });

  it("every route entry points at a known switch", () => {
    for (const k of Object.values(ROUTE_FEATURE)) expect(ALL_FEATURE_KEYS).toContain(k);
  });

  it("pages map to the most specific switch", () => {
    expect(featureForPage("/sales/invoices")).toBe("sales.invoices");
    expect(featureForPage("/sales/invoices/new")).toBe("sales.invoices");
    expect(featureForPage("/sales/returns/credit/9")).toBe("sales.returns");
    expect(featureForPage("/inventory/lot-finder")).toBe("inventory.stock");
    expect(featureForPage("/inventory/transfers/5")).toBe("inventory.transfers");
    expect(featureForPage("/accounts/statement/7")).toBe("accounts.outstanding");
    expect(featureForPage("/settings/tally")).toBe("tally");
    expect(featureForPage("/")).toBeUndefined();
    expect(featureForPage("/catalogue/products")).toBeUndefined();
    expect(featureForPage("/settings/users")).toBeUndefined();
  });
});
