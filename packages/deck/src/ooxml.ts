import { XMLParser } from "fast-xml-parser";

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

type OrderedEntry = Record<string, unknown> & { ":@"?: Record<string, string> };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const TEXT_KEY = "#text";
const ATTRS_KEY = ":@";

function toNodes(entries: OrderedEntry[]): XmlNode[] {
  const nodes: XmlNode[] = [];
  for (const entry of entries) {
    const name = Object.keys(entry).find((key) => key !== ATTRS_KEY);
    if (!name || name === TEXT_KEY || name.startsWith("?")) continue;
    const content = entry[name];
    const childEntries = Array.isArray(content)
      ? (content as OrderedEntry[])
      : [];
    nodes.push({
      name,
      attrs: entry[ATTRS_KEY] ?? {},
      children: toNodes(childEntries),
      text: childEntries
        .map((child) =>
          typeof child[TEXT_KEY] === "string" ? child[TEXT_KEY] : "",
        )
        .join(""),
    });
  }
  return nodes;
}

export function parseXml(xml: string): XmlNode | null {
  const [root] = toNodes(parser.parse(xml) as OrderedEntry[]);
  return root ?? null;
}

export function child(node: XmlNode | null | undefined, name: string) {
  return node?.children.find((item) => item.name === name) ?? null;
}

export function childrenNamed(node: XmlNode | null | undefined, name: string) {
  return node?.children.filter((item) => item.name === name) ?? [];
}

export function path(
  node: XmlNode | null | undefined,
  names: readonly string[],
): XmlNode | null {
  let current = node ?? null;
  for (const name of names) {
    current = child(current, name);
    if (!current) return null;
  }
  return current;
}

export function numberAttr(node: XmlNode | null, name: string) {
  const value = node?.attrs[name];
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
