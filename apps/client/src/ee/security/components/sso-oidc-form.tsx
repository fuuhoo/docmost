import React from "react";
import { z } from "zod";
import { useForm, zodResolver } from "@mantine/form";
import { Box, Button, Group, Stack, Switch, TextInput, Text, Accordion } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { buildCallbackUrl } from "@/ee/security/sso.utils.ts";
import classes from "@/ee/security/components/sso.module.css";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import CopyTextButton from "@/components/common/copy.tsx";
import { useTranslation } from "react-i18next";
import { useUpdateSsoProviderMutation } from "@/ee/security/queries/security-query.ts";

const ssoSchema = z.object({
  name: z.string().min(1, "Display name is required"),
  oidcIssuer: z.string().url(),
  oidcClientId: z.string().min(1, "Client id is required"),
  oidcClientSecret: z.string().min(1, "Client secret is required"),
  isEnabled: z.boolean(),
  allowSignup: z.boolean(),
  groupSync: z.boolean(),
});

type SSOFormValues = z.infer<typeof ssoSchema>;

interface SsoFormProps {
  provider: IAuthProvider;
  onClose?: () => void;
}
export function SsoOIDCForm({ provider, onClose }: SsoFormProps) {
  const { t } = useTranslation();
  const updateSsoProviderMutation = useUpdateSsoProviderMutation();

  const form = useForm<SSOFormValues>({
    initialValues: {
      name: provider.name || "",
      oidcIssuer: provider.oidcIssuer || "",
      oidcClientId: provider.oidcClientId || "",
      oidcClientSecret: provider.oidcClientSecret || "",
      isEnabled: provider.isEnabled,
      allowSignup: provider.allowSignup,
      groupSync: provider.groupSync || false,
    },
    validate: zodResolver(ssoSchema),
  });

  const callbackUrl = buildCallbackUrl({
    providerId: provider.id,
    type: provider.type,
  });

  const handleSubmit = async (values: SSOFormValues) => {
    const ssoData: Partial<IAuthProvider> = {
      providerId: provider.id,
    };
    if (form.isDirty("name")) {
      ssoData.name = values.name;
    }
    if (form.isDirty("oidcIssuer")) {
      ssoData.oidcIssuer = values.oidcIssuer;
    }
    if (form.isDirty("oidcClientId")) {
      ssoData.oidcClientId = values.oidcClientId;
    }
    if (form.isDirty("oidcClientSecret")) {
      ssoData.oidcClientSecret = values.oidcClientSecret;
    }
    if (form.isDirty("isEnabled")) {
      ssoData.isEnabled = values.isEnabled;
    }
    if (form.isDirty("allowSignup")) {
      ssoData.allowSignup = values.allowSignup;
    }
    if (form.isDirty("groupSync")) {
      ssoData.groupSync = values.groupSync;
    }

    await updateSsoProviderMutation.mutateAsync(ssoData);
    form.resetDirty();
    onClose();
  };

  return (
    <Box maw={600} mx="auto">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label={t("Display name")}
            placeholder="e.g Google SSO"
            data-autofocus
            {...form.getInputProps("name")}
          />
          <TextInput
            label="Callback URL"
            variant="filled"
            value={callbackUrl}
            pointer
            readOnly
            rightSection={<CopyTextButton text={callbackUrl} />}
          />
          <TextInput
            label="Issuer URL"
            description="OIDC 颁发者地址（Discovery URL），一般是 IdP 的根地址，例如 https://accounts.google.com/ 或 https://login.example.com/realms/foo。保存时服务端会访问 {issuer}/.well-known/openid-configuration 自动发现端点。"
            placeholder="e.g https://accounts.google.com/"
            {...form.getInputProps("oidcIssuer")}
          />
          <TextInput
            label="Client ID"
            description="在 IdP（Keycloak / Okta / Authing / 飞书 / 钉钉 / Google 等）创建 OIDC 应用时由 IdP 颁发的客户端标识。需在 IdP 端把上方 Callback URL 加入该应用的「允许的重定向 URI」列表。"
            placeholder="e.g 292085223830.apps.googleusercontent.com"
            {...form.getInputProps("oidcClientId")}
          />
          <TextInput
            label="Client Secret"
            description="上述 OIDC 应用对应的客户端密钥，仅服务端使用、不会返回给浏览器。请妥善保管；若怀疑泄露请在 IdP 端重置后重新填入。"
            placeholder="e.g OCSPX-zVCkotEPGRnJA1XKUrbgjlf7PQQ-"
            {...form.getInputProps("oidcClientSecret")}
          />

          <Accordion variant="separated">
            <Accordion.Item value="oidc-help">
              <Accordion.Control icon={<IconInfoCircle size={20} />}>
                {t("OIDC 配置说明")}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  <Text size="sm">
                    在你的身份提供商（IdP）后台创建一个 OIDC 客户端应用，并把上方的
                    <Text component="span" fw={600}> Callback URL </Text>
                    填到该应用的「Redirect URI / 回调地址」中。
                  </Text>
                  <Text size="sm">
                    <Text component="span" fw={600}>Issuer URL</Text>
                    通常是 IdP 的对外基地址，Docmost 会拼接
                    <Text component="span" fw={600}> /.well-known/openid-configuration</Text>
                    自动发现授权端点与 JWKS。
                  </Text>
                  <Text size="sm">
                    <Text component="span" fw={600}>Client ID / Client Secret</Text>
                    来自 IdP 创建应用后返回的凭据；Docmost 会用它换取用户信息和 ID Token。
                  </Text>
                  <Text size="sm">
                    IdP 必须返回包含 <Text component="span" fw={600}>email</Text>
                    声明的用户信息，否则登录会失败。若 IdP 返回的 email 未经验证，请关闭「允许注册」以避免账号伪造。
                  </Text>
                  <Text size="sm" c="dimmed">
                    常见 IdP 示例：Keycloak（{`{base}/realms/{realm}`}）、Authing、Okta、Azure AD / Entra ID、Google、飞书、钉钉、企业微信。
                  </Text>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Group justify="space-between">
            <div>{t("Group sync")}</div>
            <Switch
              className={classes.switch}
              checked={form.values.groupSync}
              {...form.getInputProps("groupSync")}
            />
          </Group>

          <Group justify="space-between">
            <div>{t("Allow signup")}</div>
            <Switch
              className={classes.switch}
              checked={form.values.allowSignup}
              {...form.getInputProps("allowSignup")}
            />
          </Group>

          <Group justify="space-between">
            <div>{t("Enabled")}</div>
            <Switch
              className={classes.switch}
              checked={form.values.isEnabled}
              {...form.getInputProps("isEnabled")}
            />
          </Group>

          <Group mt="md" justify="flex-end">
            <Button type="submit" disabled={!form.isDirty()}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Box>
  );
}
