import * as z from "zod";
import { useForm, zodResolver } from "@mantine/form";
import useAuth from "@/features/auth/hooks/use-auth";
import { ILogin } from "@/features/auth/types/auth.types";
import {
  Alert,
  Container,
  Title,
  TextInput,
  Button,
  PasswordInput,
  Box,
  Anchor,
  Group,
} from "@mantine/core";
import classes from "./auth.module.css";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { Link, useSearchParams } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { useTranslation } from "react-i18next";
import SsoLogin from "@/ee/components/sso-login.tsx";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { IconAlertCircle } from "@tabler/icons-react";
import React from "react";

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: "email is required" })
    .email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export function LoginForm() {
  const { t } = useTranslation();
  const { signIn, isLoading } = useAuth();
  useRedirectIfAuthenticated();
  const [searchParams] = useSearchParams();
  const {
    data,
    isLoading: isDataLoading,
    isError,
    error,
  } = useWorkspacePublicDataQuery();

  const form = useForm<ILogin>({
    validate: zodResolver(formSchema),
    initialValues: {
      email: "",
      password: "",
    },
  });

  // Check for SSO error from callback redirect
  const ssoError = searchParams.get("error");
  const ssoErrorMessage = ssoError === "sso_failed"
    ? t("SSO login failed. Please try again.")
    : ssoError === "oidc_failed"
    ? t("OIDC login failed. Please try again.")
    : null;

  async function onSubmit(data: ILogin) {
    await signIn(data);
  }

  if (isDataLoading) {
    return (
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={2} ta="center" fw={500} mb="md">
            {t("Login")}
          </Title>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            {t("Loading...")}
          </div>
        </Box>
      </Container>
    );
  }

  // If there's an error, still show the login form
  // Don't return Error404 for API errors in login page

  return (
    <Container size={420} className={classes.container}>
      <Box p="xl" className={classes.containerBox}>
        <Title order={2} ta="center" fw={500} mb="md">
          {t("Login")}
        </Title>

        {ssoErrorMessage && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title={t("Authentication Error")}
            color="red"
            mb="md"
            variant="light"
          >
            {ssoErrorMessage}
          </Alert>
        )}

        <SsoLogin />

        <>
          <form onSubmit={form.onSubmit(onSubmit)}>
            <TextInput
              id="email"
              type="email"
              label={t("Email")}
              placeholder="email@example.com"
              variant="filled"
              {...form.getInputProps("email")}
            />

            <PasswordInput
              label={t("Password")}
              placeholder={t("Your password")}
              variant="filled"
              mt="md"
              {...form.getInputProps("password")}
            />

            <Group justify="flex-end" mt="sm">
              <Anchor
                to={APP_ROUTE.AUTH.FORGOT_PASSWORD}
                component={Link}
                underline="never"
                size="sm"
              >
                {t("Forgot your password?")}
              </Anchor>
            </Group>

            <Button type="submit" fullWidth mt="md" loading={isLoading}>
              {t("Sign In")}
            </Button>

            <Group justify="center" mt="md">
              <Button
                component={Link}
                to={APP_ROUTE.AUTH.REGISTER}
                variant="outline"
                fullWidth
              >
                {t("Create an account")}
              </Button>
            </Group>
          </form>
        </>
      </Box>
    </Container>
  );
}
