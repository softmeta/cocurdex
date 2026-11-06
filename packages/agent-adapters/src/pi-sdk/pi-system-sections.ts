import type { InlineExtension } from "@earendil-works/pi-coding-agent";

export interface PiSystemSections {
  extension: InlineExtension;
  set(sections: Record<string, string>): void;
}

export function createPiSystemSections(): PiSystemSections {
  let current: Record<string, string> = {};
  return {
    extension: {
      name: "cocurdex-system-sections",
      builtin: true,
      factory: (pi) => {
        pi.on("before_agent_start", (event) => {
          Object.assign(event.systemPromptOptions.sections, current);
        });
      },
    },
    set(sections) {
      current = { ...sections };
    },
  };
}
