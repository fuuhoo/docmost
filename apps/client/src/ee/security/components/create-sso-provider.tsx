import React, { useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import { Button, Group, Text } from "@mantine/core";
import { IconLock, IconServer } from "@tabler/icons-react";
import { useCreateSsoProviderMutation } from "@/ee/security/queries/security-query.ts";
import { SSO_PROVIDER } from "@/ee/security/contants.ts";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import SsoProviderModal from "@/ee/security/components/sso-provider-modal.tsx";
import { OpenIdIcon } from "@/components/icons/openid-icon.tsx";
import { useTranslation } from "react-i18next";

export default function CreateSsoProvider() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [provider, setProvider] = useState<IAuthProvider | null>(null);

  const createSsoProviderMutation = useCreateSsoProviderMutation();

  const handleCreate = async (type: SSO_PROVIDER, defaultName: string) => {
    try {
      const newProvider = await createSsoProviderMutation.mutateAsync({
        type,
        name: defaultName,
      });
      setProvider(newProvider);
      open();
    } catch (error) {
      console.error(`Failed to create ${type} provider`, error);
    }
  };

  return (
    <>
      <SsoProviderModal opened={opened} onClose={close} provider={provider} />

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text fw={500} size="sm">
            {t("SSO providers")}
          </Text>
          <Text c="dimmed" size="xs">
            {t("You can create multiple providers of the same type (e.g. multiple OIDC servers).")}
          </Text>
        </div>

        <Group gap="xs" wrap="wrap">
          <Button
            variant="light"
            size="sm"
            leftSection={<IconLock size={16} />}
            onClick={() => handleCreate(SSO_PROVIDER.SAML, "SAML")}
          >
            {t("Add SAML")}
          </Button>

          <Button
            variant="light"
            size="sm"
            leftSection={<OpenIdIcon size={16} />}
            onClick={() => handleCreate(SSO_PROVIDER.OIDC, "OIDC")}
          >
            {t("Add OpenID")}
          </Button>

          <Button
            variant="light"
            size="sm"
            leftSection={<IconServer size={16} />}
            onClick={() => handleCreate(SSO_PROVIDER.LDAP, "LDAP")}
          >
            {t("Add LDAP")}
          </Button>
        </Group>
      </Group>
    </>
  );
}
