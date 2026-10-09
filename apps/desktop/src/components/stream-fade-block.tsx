import { useContext } from "react";
import { Block, type BlockProps } from "streamdown";
import { StreamFadeContext } from "./stream-fade-context";

export function StreamFadeBlock(props: BlockProps) {
  const fadePlugins = useContext(StreamFadeContext);
  const rehypePlugins =
    fadePlugins && props.rehypePlugins
      ? fadePlugins(props.index, props.rehypePlugins)
      : props.rehypePlugins;
  return <Block {...props} rehypePlugins={rehypePlugins} />;
}
