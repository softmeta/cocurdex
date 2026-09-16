import type { HostDirectoryListing } from "@cocurdex/shared";
import { atom, useAtom } from "jotai";
import { ArrowUp, Eye, EyeOff, Folder } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  IconButton,
  Input,
  ScrollArea,
  Spinner,
  Text,
} from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";

interface HostDirectoryPickRequest {
  resolve(path: string | null): void;
}

const hostDirectoryPickRequestAtom = atom<HostDirectoryPickRequest | null>(
  null,
);

// Picks a directory on the daemon host. Hosts with a native directory dialog
// keep using it; other clients browse through the daemon `fs.listDirectories`
// RPC via the mounted HostDirectoryPickerHost.
export const pickHostDirectoryAtom = atom(null, async (get, set) => {
  if (desktopApi.capabilities.nativeDirectoryDialog) {
    const result = await desktopApi.openWorkspace();
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }
  get(hostDirectoryPickRequestAtom)?.resolve(null);
  return new Promise<string | null>((resolve) => {
    set(hostDirectoryPickRequestAtom, { resolve });
  });
});

export function HostDirectoryPickerHost() {
  const [request, setRequest] = useAtom(hostDirectoryPickRequestAtom);
  const finish = (path: string | null) => {
    setRequest(null);
    request?.resolve(path);
  };
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogContent size="default">
        {request ? (
          <HostDirectoryBrowser
            onCancel={() => finish(null)}
            onSelect={finish}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function HostDirectoryBrowser({
  onCancel,
  onSelect,
}: {
  onCancel(): void;
  onSelect(path: string): void;
}) {
  const { t } = useTranslation("sessions");
  const [listing, setListing] = useState<HostDirectoryListing | null>(null);
  const [pathDraft, setPathDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const requestSeqRef = useRef(0);

  const load = async (path?: string) => {
    const request = ++requestSeqRef.current;
    setLoading(true);
    try {
      const next = await desktopApi.listHostDirectories(path);
      if (request !== requestSeqRef.current) return;
      setListing(next);
      setPathDraft(next.path);
      setError(null);
    } catch (cause) {
      if (request !== requestSeqRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === requestSeqRef.current) setLoading(false);
    }
  };

  // Select resolves the path field: an edited draft is validated through the
  // daemon before being returned, so a failed or uncommitted path can never
  // select the previously listed directory.
  const selectCurrent = async () => {
    const draft = pathDraft.trim();
    if (!draft) return;
    if (listing && draft === listing.path) {
      onSelect(listing.path);
      return;
    }
    const request = ++requestSeqRef.current;
    setLoading(true);
    try {
      const next = await desktopApi.listHostDirectories(draft);
      if (request !== requestSeqRef.current) return;
      onSelect(next.path);
    } catch (cause) {
      if (request !== requestSeqRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    }
  };

  useMountEffect(() => {
    void load();
  });

  const entries = (listing?.entries ?? []).filter(
    (entry) => showHidden || !entry.hidden,
  );

  let listContent = (
    <EmptyState icon={<Folder />} title={t("workspace.hostPicker.empty")} />
  );
  if (loading && !listing) {
    listContent = (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (entries.length > 0) {
    listContent = (
      <ScrollArea className="h-full">
        <ul className="flex flex-col p-1">
          {entries.map((entry) => (
            <li key={entry.path}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-start hover:bg-accent",
                  entry.hidden && "text-muted-foreground",
                )}
                type="button"
                onClick={() => void load(entry.path)}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <Text className="min-w-0 flex-1" size="meta" truncate>
                  {entry.name}
                </Text>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("workspace.hostPicker.title")}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-1.5">
        <IconButton
          aria-label={t("workspace.hostPicker.up")}
          disabled={!listing?.parent}
          size="sm"
          onClick={() => void load(listing?.parent ?? undefined)}
        >
          <ArrowUp />
        </IconButton>
        <Input
          className="h-8 flex-1"
          placeholder={t("workspace.hostPicker.pathPlaceholder")}
          spellCheck={false}
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void load(pathDraft);
            }
          }}
        />
        <IconButton
          aria-label={
            showHidden
              ? t("workspace.hostPicker.hideHidden")
              : t("workspace.hostPicker.showHidden")
          }
          aria-pressed={showHidden}
          size="sm"
          onClick={() => setShowHidden((current) => !current)}
        >
          {showHidden ? <EyeOff /> : <Eye />}
        </IconButton>
      </div>
      <div className="h-64 overflow-hidden rounded-card border border-border/70">
        {listContent}
      </div>
      {error ? (
        <Text size="meta" tone="destructive">
          {error}
        </Text>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("workspace.hostPicker.cancel")}
        </Button>
        <Button
          disabled={loading || !pathDraft.trim()}
          type="button"
          onClick={() => void selectCurrent()}
        >
          {t("workspace.hostPicker.select")}
        </Button>
      </DialogFooter>
    </>
  );
}
