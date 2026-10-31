import type { CondensedItem } from "@cocurdex/mobile/internal/session-detail/transcript-activity";
import { transcriptTurns } from "@cocurdex/mobile/internal/session-detail/transcript-turns";
import { expect, it } from "vitest";

const user = (id: string): CondensedItem => ({
  kind: "user",
  id,
  text: id,
  images: [],
});
const reply = (id: string, streaming = true): CondensedItem => ({
  kind: "assistant",
  id,
  text: id,
  streaming,
  turnEnd: !streaming,
});

it("keeps a turn anchored to its prompt through streaming and completion", () => {
  const prompt = user("prompt");
  const initial = transcriptTurns([prompt]);
  const streaming = transcriptTurns([prompt, reply("answer")]);
  const complete = transcriptTurns([prompt, reply("answer", false)]);
  expect(initial[0]?.id).toBe("prompt");
  expect(streaming[0]?.id).toBe(initial[0]?.id);
  expect(complete[0]?.id).toBe(initial[0]?.id);
  expect(complete[0]?.items.map((item) => item.id)).toEqual([
    "prompt",
    "answer",
  ]);
});

it("starts a new reading area for each prompt without dropping orphan history", () => {
  const history = reply("history", false);
  const first = user("first");
  const answer = reply("answer", false);
  const second = user("second");
  expect(transcriptTurns([history, first, answer, second])).toEqual([
    { id: "history", items: [history] },
    { id: "first", items: [first, answer] },
    { id: "second", items: [second] },
  ]);
  expect(transcriptTurns([])).toEqual([]);
});
