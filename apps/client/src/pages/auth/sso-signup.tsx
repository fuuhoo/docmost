import React, { useEffect, useState } from "react";
import { useForm, zodResolver } from "@mantine/form";
import { z } from "zod";
import {
  Container,
  Title,
  TextInput,
  Button,
  Box,
  Text,
  Alert,
  Group,
  Anchor,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { IconAlertCircle } from "@tabler/icons-react";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import {
  completeOidcSignup,
  getOidcSignupInfo,
} from "@/features/auth/services/auth-service";
import APP_ROUTE from "@/lib/app-route.ts";
import classes from "@/features/auth/components/auth.module.css";

const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }).max(50),
});

export default function SsoSignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspaceData, isLoading: isWorkspaceLoading } =
    useWorkspacePublicDataQuery();
  const [signupInfo, setSignupInfo] = useState<{
    email: string;
    name?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<{ name: string }>({
    validate: zodResolver(formSchema),
    initialValues: {
      name: "",
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSignupInfo() {
      try {
        const info = await getOidcSignupInfo();
        if (cancelled) return;

        if (info.error) {
          setError(
            t("Signup session expired or invalid. Please try logging in again."),
          );
          setIsLoading(false);
          return;
        }

        setSignupInfo(info);
        if (info.name) {
          form.setFieldValue("name", info.name);
        }
        setIsLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        const message =
          err.response?.data?.message || "Failed to load signup information";
        setError(t(message));
        setIsLoading(false);
      }
    }

    loadSignupInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values: { name: string }) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await completeOidcSignup({ name: values.name.trim() });

      if (response?.userHasMfa) {
        navigate(APP_ROUTE.AUTH.MFA_CHALLENGE);
      } else if (response?.requiresMfaSetup) {
        navigate(APP_ROUTE.AUTH.MFA_SETUP_REQUIRED);
      } else {
        navigate(APP_ROUTE.HOME);
      }
    } catch (err: any) {
      setIsLoading(false);
      const message =
        err.response?.data?.message || "Failed to complete signup";
      setError(t(message));
      notifications.show({
        message: t(message),
        color: "red",
      });
    }
  }

  if (isWorkspaceLoading || isLoading) {
    return (
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={2} ta="center" fw={500} mb="md">
            {t("Complete your account")}
          </Title>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            {t("Loading...")}
          </div>
        </Box>
      </Container>
    );
  }

  return (
    <Container size={420} className={classes.container}>
      <Box p="xl" className={classes.containerBox}>
        <Title order={2} ta="center" fw={500} mb="md">
          {t("Complete your account")}
        </Title>

        <Text ta="center" c="dimmed" mb="md" size="sm">
          {t("Please provide a display name to finish signing in with SSO")}
        </Text>

        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title={t("Error")}
            color="red"
            mb="md"
            variant="light"
          >
            {error}
          </Alert>
        )}

        <form onSubmit={form.onSubmit(onSubmit)}>
          <TextInput
            label={t("Email")}
            value={signupInfo?.email || ""}
            disabled
            variant="filled"
          />

          <TextInput
            id="sso-name"
            type="text"
            label={t("Your name")}
            placeholder={t("Enter your name")}
            variant="filled"
            mt="md"
            data-autofocus
            {...form.getInputProps("name")}
          />

          <Button
            type="submit"
            fullWidth
            mt="xl"
            loading={isLoading}
          >
            {t("Complete signup")}
          </Button>

          <Group justify="center" mt="md">
            <Anchor
              component={Link}
              to={APP_ROUTE.AUTH.LOGIN}
              underline="never"
              size="sm"
            >
              {t("Cancel and go back to login")}
            </Anchor>
          </Group>
        </form>
      </Box>
    </Container>
  );
}
