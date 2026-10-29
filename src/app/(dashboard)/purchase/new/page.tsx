import PurchaseView from "../purchase-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return PurchaseView({ startWithForm: "po" });
}
