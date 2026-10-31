const CJK = /[⺀-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3FFFF}]/u;

export interface ScriptSegment {
  text: string;
  cjk: boolean;
}

export function splitCjk(text: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  for (const character of text) {
    const cjk = CJK.test(character);
    const last = segments.at(-1);
    if (last && last.cjk === cjk) last.text += character;
    else segments.push({ text: character, cjk });
  }
  return segments.length > 0 ? segments : [{ text, cjk: false }];
}
