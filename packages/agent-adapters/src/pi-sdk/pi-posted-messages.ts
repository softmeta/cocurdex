export const PI_POSTED_MESSAGE_TYPE = "cocurdex-posted";

export interface PiCustomMessageSink {
  sendCustomMessage?(
    message: { customType: string; content: string; display: boolean },
    options?: { triggerTurn?: boolean; deliverAs?: "steer" },
  ): Promise<void>;
}

export async function appendPostedMessages(
  session: PiCustomMessageSink,
  posted: readonly string[],
  steering: boolean,
) {
  for (const content of posted) {
    await session.sendCustomMessage?.(
      { customType: PI_POSTED_MESSAGE_TYPE, content, display: false },
      steering ? { deliverAs: "steer" } : { triggerTurn: false },
    );
  }
}
