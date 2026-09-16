import { Group, Text, Switch, Title } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";

export default function SelfRegistration() {
  const { t } = useTranslation();

  return (
    <>
      <Title order={4} my="sm">
        {t("Self registration")}
      </Title>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Allow self registration")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "When enabled, users can create an account by themselves via the registration page.",
            )}
          </Text>
        </div>

        <EnableRegistrationToggle />
      </Group>
    </>
  );
}

export function EnableRegistrationToggle() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    Boolean(workspace?.enableRegistration),
  );

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updatedWorkspace = await updateWorkspace({
        enableRegistration: value,
      });
      setChecked(value);
      setWorkspace(updatedWorkspace);
    } catch (err) {
      setChecked(!value);
      notifications.show({
        message: err?.response?.data?.message || t("Failed to update data"),
        color: "red",
      });
    }
  };

  return (
    <Switch
      labelPosition="left"
      checked={checked}
      onChange={handleChange}
      aria-label={t("Toggle self registration")}
    />
  );
}
