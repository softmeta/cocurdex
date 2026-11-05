import type { Brief, BriefRoutineResult, InboxItem } from "@cocurdex/shared";
import { Newspaper } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSidebarIconButton } from "@/components/app";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@/components/ui";
import {
  briefDayLabel,
  inboxDotClass,
  inboxKindLabel,
  useBrief,
} from "@/features/inbox";

function BriefSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1">
      <Text as="h3" className="px-2" size="meta" tone="muted" weight="medium">
        {title}
      </Text>
      <ul className="flex min-w-0 flex-col">{children}</ul>
    </section>
  );
}

function BriefRow({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <li>
      <button
        className="flex w-full min-w-0 items-start gap-2 rounded-control px-2 py-1.5 text-start hover:bg-muted disabled:hover:bg-transparent"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </li>
  );
}

function BriefItemRow({
  item,
  onOpen,
}: {
  item: InboxItem;
  onOpen(item: InboxItem): void;
}) {
  const { t } = useTranslation("personal");
  const label = inboxKindLabel(t, item.kind);
  return (
    <BriefRow onClick={() => onOpen(item)}>
      <span
        aria-label={label}
        className={`mt-2 size-1.5 shrink-0 rounded-full ${inboxDotClass(item.kind)}`}
        role="img"
      />
      <span className="flex min-w-0 flex-col">
        <Text truncate>{item.title}</Text>
        <Text size="meta" tone="muted" truncate>
          {item.detail ? `${label} · ${item.detail}` : label}
        </Text>
      </span>
    </BriefRow>
  );
}

function BriefResultRow({
  result,
  onOpen,
}: {
  result: BriefRoutineResult;
  onOpen(sessionId: string): void;
}) {
  const { sessionId } = result;
  return (
    <BriefRow
      disabled={!sessionId}
      onClick={() => {
        if (sessionId) onOpen(sessionId);
      }}
    >
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="flex min-w-0 flex-col">
        <Text truncate>{result.routineName}</Text>
        <Text className="line-clamp-2" size="meta" tone="muted">
          {result.summary}
        </Text>
      </span>
    </BriefRow>
  );
}

function BriefDialog({
  brief,
  open,
  onOpenChange,
  onOpenItem,
  onOpenSession,
}: {
  brief: Brief;
  open: boolean;
  onOpenChange(open: boolean): void;
  onOpenItem(item: InboxItem): void;
  onOpenSession(sessionId: string): void;
}) {
  const { t, i18n } = useTranslation("personal");
  const openItem = (item: InboxItem) => {
    onOpenChange(false);
    onOpenItem(item);
  };
  const openSession = (sessionId: string) => {
    onOpenChange(false);
    onOpenSession(sessionId);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{t("brief.title")}</DialogTitle>
          <DialogDescription>
            {briefDayLabel(brief.day, i18n.language)}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 flex max-h-[60vh] min-w-0 flex-col gap-4 overflow-y-auto">
          {brief.needsYou.length > 0 ? (
            <BriefSection title={t("brief.needsYou")}>
              {brief.needsYou.map((item) => (
                <BriefItemRow item={item} key={item.id} onOpen={openItem} />
              ))}
            </BriefSection>
          ) : null}
          {brief.results.length > 0 ? (
            <BriefSection title={t("brief.results")}>
              {brief.results.map((result) => (
                <BriefResultRow
                  key={result.routineId}
                  onOpen={openSession}
                  result={result}
                />
              ))}
            </BriefSection>
          ) : null}
          {brief.failures.length > 0 ? (
            <BriefSection title={t("brief.failures")}>
              {brief.failures.map((item) => (
                <BriefItemRow item={item} key={item.id} onOpen={openItem} />
              ))}
            </BriefSection>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("brief.dismiss")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BriefControl({
  onOpenItem,
  onOpenSession,
}: {
  onOpenItem(item: InboxItem): void;
  onOpenSession(sessionId: string): void;
}) {
  const { t } = useTranslation("personal");
  const brief = useBrief();
  const [open, setOpen] = useState(false);
  if (!brief) return null;

  const label = t("brief.open");

  return (
    <>
      <AppSidebarIconButton aria-label={label} onClick={() => setOpen(true)}>
        <Newspaper className="size-3.5" />
      </AppSidebarIconButton>
      <BriefDialog
        brief={brief}
        onOpenChange={setOpen}
        onOpenItem={onOpenItem}
        onOpenSession={onOpenSession}
        open={open}
      />
    </>
  );
}
