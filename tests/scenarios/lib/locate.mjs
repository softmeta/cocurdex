const POLL_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

function matchesName(actual, expected, exact) {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(actual);
  return exact ? actual === expected : actual.includes(expected);
}

function matchesQuery(node, { role, name, exact = true }) {
  if (node.ignored || node.role?.value !== role) return false;
  return matchesName(node.name?.value ?? "", name, exact);
}

function describeQuery({ role, name, within }) {
  const target = name === undefined ? role : `${role} "${name}"`;
  return within ? `${target} in ${describeQuery(within)}` : target;
}

export async function queryAllByRole(session, query) {
  const { nodes } = await session.send("Accessibility.getFullAXTree", {});
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const isInside = (node) => {
    if (!query.within) return true;
    for (
      let parent = byId.get(node.parentId);
      parent;
      parent = byId.get(parent.parentId)
    ) {
      if (matchesQuery(parent, query.within)) return true;
    }
    return false;
  };
  return nodes
    .filter((node) => matchesQuery(node, query) && isInside(node))
    .map((node) => ({
      backendNodeId: node.backendDOMNodeId,
      name: node.name?.value ?? "",
    }));
}

export async function waitForRole(
  session,
  query,
  timeout = DEFAULT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const matches = await queryAllByRole(session, query);
    if (matches.length > 0) return matches;
    if (Date.now() >= deadline) {
      throw new Error(`No ${describeQuery(query)} within ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export async function waitForNoRole(
  session,
  query,
  timeout = DEFAULT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const matches = await queryAllByRole(session, query);
    if (matches.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `${describeQuery(query)} still present after ${timeout}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export async function clickPoint(session, point, button = "left") {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.send("Input.dispatchMouseEvent", {
      type,
      button,
      clickCount: 1,
      ...point,
    });
  }
}

async function settledPointOf(fromLeft, timeout) {
  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(resolve));
  const finiteAnimations = document.getAnimations().filter((animation) => {
    const target = animation.effect?.target;
    const { iterations } = animation.effect?.getComputedTiming() ?? {};
    return (
      target instanceof Element &&
      target.contains(this) &&
      iterations !== Number.POSITIVE_INFINITY
    );
  });
  await Promise.all(
    finiteAnimations.map((animation) => animation.finished.catch(() => {})),
  );
  const deadline = performance.now() + timeout;
  let previous = null;
  for (;;) {
    await nextFrame();
    const rect = this.getBoundingClientRect();
    const point = {
      x: fromLeft === null ? rect.x + rect.width / 2 : rect.x + fromLeft,
      y: rect.y + rect.height / 2,
    };
    const hit = document.elementFromPoint(point.x, point.y);
    const settled =
      previous !== null &&
      previous.x === point.x &&
      previous.y === point.y &&
      previous.width === rect.width &&
      previous.height === rect.height;
    if (settled && hit && this.contains(hit)) return point;
    if (performance.now() >= deadline) {
      const covering = hit?.outerHTML.slice(0, 160) ?? "nothing";
      throw new Error(`Element did not settle at its point; hit ${covering}`);
    }
    previous = { ...point, width: rect.width, height: rect.height };
  }
}

export async function settledPoint(
  session,
  backendNodeId,
  { fromLeft = null, timeout = DEFAULT_TIMEOUT_MS } = {},
) {
  await session.send("DOM.getDocument", { depth: 0 });
  await session.send("DOM.scrollIntoViewIfNeeded", { backendNodeId });
  const { object } = await session.send("DOM.resolveNode", { backendNodeId });
  const { result, exceptionDetails } = await session.send(
    "Runtime.callFunctionOn",
    {
      objectId: object.objectId,
      functionDeclaration: settledPointOf.toString(),
      arguments: [{ value: fromLeft }, { value: timeout }],
      awaitPromise: true,
      returnByValue: true,
    },
  );
  await session.send("Runtime.releaseObject", { objectId: object.objectId });
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    );
  }
  return result.value;
}

export async function backendNodeIdOf(session, selector) {
  const { root } = await session.send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await session.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  if (!nodeId) throw new Error(`No element matches ${selector}`);
  const { node } = await session.send("DOM.describeNode", { nodeId });
  return node.backendNodeId;
}

export async function centerOf(session, backendNodeId) {
  return settledPoint(session, backendNodeId);
}

export async function clickSelector(session, selector, options) {
  const backendNodeId = await backendNodeIdOf(session, selector);
  await clickPoint(
    session,
    await settledPoint(session, backendNodeId, options),
  );
}

export async function clickByRole(
  session,
  query,
  timeout = DEFAULT_TIMEOUT_MS,
  button = "left",
) {
  const matches = await waitForRole(session, query, timeout);
  if (matches.length > 1) {
    const names = matches.map((match) => match.name);
    throw new Error(
      `${describeQuery(query)} is ambiguous: ${JSON.stringify(names)}`,
    );
  }
  await clickPoint(
    session,
    await centerOf(session, matches[0].backendNodeId),
    button,
  );
  return matches[0];
}
