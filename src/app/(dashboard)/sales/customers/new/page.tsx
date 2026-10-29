import SalesView from "../../sales-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return SalesView({ startWithForm: "customer" });
}
