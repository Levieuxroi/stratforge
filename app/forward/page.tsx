import ForwardClient from "./ForwardClient";
import { requirePlan } from "../../lib/pageGuard";

export default async function Page() {
  await requirePlan("pro", "/forward");
  return <ForwardClient />;
}