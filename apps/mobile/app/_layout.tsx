import { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Slot, useSegments } from "expo-router";
import { lightColors } from "@lifeos/ui";

import { useSessionStore } from "../lib/session";

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const status = useSessionStore((state) => state.status);
  const segments = useSegments();
  const inAuthGroup = segments[0] === "(auth)";
  const inTabsGroup = segments[0] === "(tabs)";

  useEffect(() => {
    void useSessionStore.getState().restoreSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {status === "loading" ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={lightColors.accent.brand} />
        </View>
      ) : status === "unauthenticated" ? (
        inAuthGroup ? <Slot /> : <Redirect href="/(auth)/sign-in" />
      ) : inTabsGroup ? (
        <Slot />
      ) : (
        <Redirect href="/(tabs)/home" />
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.background.primary,
  },
});
