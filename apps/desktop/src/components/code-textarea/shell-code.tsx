import { Fragment } from "react";
import { shellTokenStyle, useShellTokenLines } from "./use-shell-token-lines";

export function ShellCode({ code }: { code: string }) {
  const tokenLines = useShellTokenLines(code);

  if (!tokenLines) {
    return code;
  }

  return tokenLines.map((line, lineIndex) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: tokens are a pure render of `code` and never reorder
    <Fragment key={lineIndex}>
      {lineIndex > 0 ? "\n" : null}
      {line.map((token, tokenIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are a pure render of `code` and never reorder
        <span key={tokenIndex} style={shellTokenStyle(token)}>
          {token.content}
        </span>
      ))}
    </Fragment>
  ));
}
