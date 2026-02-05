import { Helmet } from "react-helmet-async";
import { SetupWorkspaceForm } from "@/features/auth/components/setup-workspace-form.tsx";
import { getAppName } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";
import { Box, Text, Anchor, Group, Center } from "@mantine/core";
import { Link } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";

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
      <Center mt="xl">
        <Box ta="center">
          <Text>
            {t("Already have an account?")} {" "}
            <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN} fw={500}>
              {t("Sign in")}
            </Anchor>
          </Text>
        </Box>
      </Center>
    </>
  );
}
