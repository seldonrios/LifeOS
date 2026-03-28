import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { LoginRequestSchema, type LoginRequest as LoginRequestType } from '@lifeos/contracts';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { useSessionStore } from '../../lib/session';

export default function SignInScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const signIn = useSessionStore((state) => state.signIn);
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequestType>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { field: emailField } = useController({
    control,
    name: 'email',
  });

  const { field: passwordField } = useController({
    control,
    name: 'password',
  });

  const onSubmit = async (data: LoginRequestType) => {
    setServerError(null);

    try {
      await signIn(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in';
      setServerError(message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <Text style={[styles.logo, { color: palette.accent.brand }]}>LifeOS</Text>
      <Text style={[styles.title, { color: palette.text.primary }]}>Sign in to LifeOS</Text>
      <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
        Your sovereign AI node
      </Text>

      <View style={styles.formSection}>
        <TextInput
          value={emailField.value}
          onBlur={emailField.onBlur}
          onChangeText={emailField.onChange}
          editable={!isSubmitting}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={palette.text.muted}
          style={[
            styles.input,
            {
              color: palette.text.primary,
              borderColor: palette.border.default,
              backgroundColor: palette.background.secondary,
            },
          ]}
        />
        {errors.email ? (
          <Text style={[styles.errorText, { color: palette.accent.danger }]}>
            {errors.email.message}
          </Text>
        ) : null}

        <TextInput
          value={passwordField.value}
          onBlur={passwordField.onBlur}
          onChangeText={passwordField.onChange}
          editable={!isSubmitting}
          secureTextEntry
          autoCorrect={false}
          placeholder="Password"
          placeholderTextColor={palette.text.muted}
          style={[
            styles.input,
            {
              color: palette.text.primary,
              borderColor: palette.border.default,
              backgroundColor: palette.background.secondary,
            },
          ]}
        />
        {errors.password ? (
          <Text style={[styles.errorText, { color: palette.accent.danger }]}>
            {errors.password.message}
          </Text>
        ) : null}

        {serverError ? (
          <Text style={[styles.errorText, { color: palette.accent.danger }]}>{serverError}</Text>
        ) : null}
      </View>

      <Pressable
        style={[styles.button, { backgroundColor: palette.accent.brand }]}
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={palette.background.primary} />
        ) : (
          <Text style={[styles.buttonText, { color: palette.background.primary }]}>Sign in</Text>
        )}
      </Pressable>

      <Text style={[styles.footnote, { color: palette.text.muted }]}>
        All data stays on your device by default
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  logo: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  formSection: {
    gap: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  button: {
    marginTop: spacing[4],
    borderRadius: spacing[2],
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  buttonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  footnote: {
    marginTop: spacing[4],
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
});
