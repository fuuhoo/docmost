import { Helmet } from "react-helmet-async";
import { SetupWorkspaceForm } from "@/features/auth/components/setup-workspace-form.tsx";
import { getAppName } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";

export default function SignupPage() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("Sign Up")} - {getAppName()}
        </title>
      </Helmet>
      <SetupWorkspaceForm isCreateAccount={true} />
    </>
  );
}
