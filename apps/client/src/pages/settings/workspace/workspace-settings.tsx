import SettingsTitle from "@/components/settings/settings-title.tsx";
import WorkspaceNameForm from "@/features/workspace/components/settings/components/workspace-name-form";
import WorkspaceIcon from "@/features/workspace/components/settings/components/workspace-icon.tsx";
import { useTranslation } from "react-i18next";
import { getAppName, isCloud } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import ManageHostname from "@/ee/components/manage-hostname.tsx";
import { Divider } from "@mantine/core";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function WorkspaceSettings() {
  const { t } = useTranslation();
  const { isOwner } = useUserRole();

  if (!isOwner) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Workspace Settings - {getAppName()}</title>
      </Helmet>
      <SettingsTitle title={t("General")} />
      <WorkspaceIcon />
      <WorkspaceNameForm />

      {isCloud() && (
        <>
          <Divider my="md" />
          <ManageHostname />
        </>
      )}
    </>
  );
}
