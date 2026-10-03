import type { Metadata } from "next";
import GraphView from "./GraphView";

export const metadata: Metadata = { title: "Knowledge Graph · J.A.R.V.I.S." };

export default function GraphPage() {
  return <GraphView />;
}
