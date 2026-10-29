import StockView from "../stock-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return StockView({ startWithForm: "product" });
}
