export function bindCodeTail(container: HTMLElement) {
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  };
  const resize = new ResizeObserver(schedule);
  const observeSize = () => {
    resize.disconnect();
    resize.observe(container);
    if (container.firstElementChild)
      resize.observe(container.firstElementChild);
  };
  const mutations = new MutationObserver(() => {
    observeSize();
    schedule();
  });
  mutations.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  observeSize();
  schedule();
  return () => {
    mutations.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
  };
}
