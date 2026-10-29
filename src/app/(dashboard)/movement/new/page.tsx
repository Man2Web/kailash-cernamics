import MovementView from "../movement-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return MovementView({ startWithForm: "dispatch" });
}
