export function updatePreviewDom(html: string) {
  const top = window.scrollY;
  const follow =
    top + window.innerHeight >= document.documentElement.scrollHeight - 48;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const node of parsed.querySelectorAll(
    "script, iframe, frame, object, embed, base, meta[http-equiv]",
  ))
    node.remove();
  for (const element of parsed.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        /^\s*javascript:/i.test(attribute.value)
      )
        element.removeAttribute(attribute.name);
    }
  }
  const sync = (target: Node, source: Node) => {
    if (target instanceof Element && source instanceof Element) {
      for (const attribute of Array.from(target.attributes)) {
        if (!source.hasAttribute(attribute.name))
          target.removeAttribute(attribute.name);
      }
      for (const attribute of Array.from(source.attributes)) {
        if (target.getAttribute(attribute.name) !== attribute.value)
          target.setAttribute(attribute.name, attribute.value);
      }
    }
    const current = Array.from(target.childNodes).filter(
      (node) =>
        !(
          node instanceof Element &&
          node.matches('meta[http-equiv="Content-Security-Policy" i]')
        ),
    );
    const next = Array.from(source.childNodes);
    for (
      let index = 0;
      index < Math.max(current.length, next.length);
      index++
    ) {
      const old = current[index];
      const fresh = next[index];
      if (!fresh) old.remove();
      else if (!old) target.appendChild(fresh.cloneNode(true));
      else if (
        old.nodeType !== fresh.nodeType ||
        old.nodeName !== fresh.nodeName
      )
        old.replaceWith(fresh.cloneNode(true));
      else if (
        old.nodeType === Node.TEXT_NODE ||
        old.nodeType === Node.COMMENT_NODE
      ) {
        if (old.nodeValue !== fresh.nodeValue) old.nodeValue = fresh.nodeValue;
      } else sync(old, fresh);
    }
  };
  sync(document.documentElement, parsed.documentElement);
  window.scrollTo({
    top: follow ? document.documentElement.scrollHeight : top,
    behavior: "instant",
  });
  return { title: document.title };
}

export function previewScrollPosition() {
  return {
    top: window.scrollY,
    follow:
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 48,
  };
}
