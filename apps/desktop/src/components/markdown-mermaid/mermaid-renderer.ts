import type { CustomRenderer } from "streamdown";
import { MermaidDiagram } from "./mermaid-diagram";

export const MERMAID_RENDERER: CustomRenderer = {
  component: MermaidDiagram,
  language: "mermaid",
};
