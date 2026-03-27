import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { darkColors, lightColors, spacing, typography } from "@lifeos/ui";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { useSessionStore } from "../../lib/session";

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;

  const user = useSessionStore((state) => state.user);
  const signOut = useSessionStore((state) => state.signOut);

  const [notifStatus, setNotifStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const loadPermissionStatus = async () => {
      const status = await Notifications.getPermissionsAsync();
      setNotifStatus(status.granted ? "granted" : status.status);
    };

    void loadPermissionStatus();
  }, []);

  const handleRequestPermissions = async () => {
    const status = await Notifications.requestPermissionsAsync();
    setNotifStatus(status.granted ? "granted" : status.status);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  };

  const appVersion = Constants.expoConfig?.version ?? "0.1.0";
  const isGranted = notifStatus === "granted";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>ACCOUNT</Text>
          <Text style={[styles.primaryText, { color: palette.text.primary }]}>{user?.displayName ?? "Unknown user"}</Text>
          <Text style={[styles.secondaryText, { color: palette.text.secondary }]}>{user?.email ?? "No email"}</Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>NOTIFICATIONS</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.labelText, { color: palette.text.secondary }]}>Status</Text>
            <Text
              style={[
                styles.statusText,
                { color: isGranted ? palette.accent.success : palette.text.muted },
              ]}
            >
              {isGranted ? "Granted" : "Not granted"}
            </Text>
          </View>
          {!isGranted ? (
            <Pressable
              style={[styles.outlineButton, { borderColor: palette.accent.brand }]}
              onPress={() => {
                void handleRequestPermissions();
              }}
            >
              <Text style={[styles.outlineButtonText, { color: palette.accent.brand }]}>Request permissions</Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>APP</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.labelText, { color: palette.text.secondary }]}>Version</Text>
            <Text style={[styles.valueText, { color: palette.text.primary }]}>{appVersion}</Text>
          </View>
        </View>

        <Pressable
          style={[styles.signOutButton, { backgroundColor: palette.accent.danger }]}
          onPress={() => {
            void handleSignOut();
          }}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <ActivityIndicator color={palette.background.primary} />
          ) : (
            <Text style={[styles.signOutButtonText, { color: palette.background.primary }]}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing[2],
  },
  labelText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  valueText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  primaryText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  outlineButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    alignSelf: "flex-start",
  },
  outlineButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  signOutButton: {
    borderRadius: spacing[3],
    paddingVertical: spacing[3],
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  signOutButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});
