import { useTranslation } from "react-i18next";
import { HostsList } from "@/computers";
import { EmptyHosts, usePairingRoutes, useSavedHosts } from "@/hosts";
import { HeaderButtons } from "@/ui";

export default function ComputersRoute() {
  const { t } = useTranslation();
  const { openPaste, openScan } = usePairingRoutes();
  const hasHosts = useSavedHosts().length > 0;

  return (
    <>
      <HeaderButtons
        items={[
          {
            key: "pair",
            icon: { ios: "plus", android: "add" },
            label: t("screens.pair"),
            onPress: openPaste,
          },
        ]}
      />
      {hasHosts ? (
        <HostsList />
      ) : (
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
      )}
    </>
  );
}
