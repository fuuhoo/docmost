import { Stack, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useTranslation } from "react-i18next";

const sourceLabelMap: Record<string, string> = {
  invite: "Invited",
  oidc: "OIDC",
  self: "Self registered",
};

export default function AccountSourceInfo() {
  const { t } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);
  const source = currentUser?.user.accountSource;

  if (!source) {
    return null;
  }

  return (
    <Stack gap="xs" mb="md">
      <Text size="sm" fw={500}>
        {t("Account source")}
      </Text>
      <Text size="sm" c="dimmed">
        {t(sourceLabelMap[source] ?? source)}
      </Text>
    </Stack>
  );
}
