export function SidebarOverflowTitle({ children }: { children: string }) {
  return (
    <span className="sidebar-overflow-title">
      <span className="sidebar-overflow-title__text">{children}</span>
    </span>
  );
}
