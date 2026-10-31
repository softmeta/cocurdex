export type MermaidAppearance = "dark" | "light";

export interface MermaidThemeVariables {
  background: string;
  clusterBkg: string;
  clusterBorder: string;
  darkMode: boolean;
  edgeLabelBackground: string;
  lineColor: string;
  primaryBorderColor: string;
  primaryColor: string;
  primaryTextColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  textColor: string;
}

export const MERMAID_THEME_VARIABLES: Record<
  MermaidAppearance,
  MermaidThemeVariables
> = {
  dark: {
    background: "#0a0a0a",
    clusterBkg: "#11161d",
    clusterBorder: "#2a323d",
    darkMode: true,
    edgeLabelBackground: "#151a21",
    lineColor: "#6e7681",
    primaryBorderColor: "#2c4a72",
    primaryColor: "#14243a",
    primaryTextColor: "#b9d7ff",
    secondaryColor: "#1b2a1f",
    tertiaryColor: "#241c2e",
    textColor: "#c9d1d9",
  },
  light: {
    background: "#ffffff",
    clusterBkg: "#f6f8fa",
    clusterBorder: "#d8dee4",
    darkMode: false,
    edgeLabelBackground: "#ffffff",
    lineColor: "#8c959f",
    primaryBorderColor: "#b6d4fb",
    primaryColor: "#e7f1fd",
    primaryTextColor: "#0b4f9c",
    secondaryColor: "#e9f6ec",
    tertiaryColor: "#f3eefb",
    textColor: "#24292f",
  },
};

export const MERMAID_THEME_CSS = [
  ".node rect, .cluster rect { rx: 10px; ry: 10px; }",
  ".edgeLabel, .edgeLabel p { border-radius: 4px; }",
].join("\n");
