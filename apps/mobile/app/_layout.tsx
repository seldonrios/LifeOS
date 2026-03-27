import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";

import { colors, type AppTheme } from "../lib/theme";
import { queryClient } from "../lib/query-client";

type ThemeContextValue = {
  theme: AppTheme;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: { colors: colors.light },
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = useMemo(
    () => ({
      colors: colorScheme === "dark" ? colors.dark : colors.light,
    }),
    [colorScheme],
  );

  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
