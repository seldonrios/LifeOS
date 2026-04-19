import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { ErrorBanner } from '../../components/ErrorBanner';
import { sdk } from '../../lib/sdk';

export default function ExportScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const captures: Awaited<ReturnType<typeof sdk.capture.search>> = [];
      const pageSize = 200;
      let offset = 0;

      while (true) {
        const page = await sdk.capture.search('', { limit: pageSize, offset });
        captures.push(...page);

        if (page.length < pageSize) {
          break;
        }

        offset += page.length;
      }

      const jsonString = JSON.stringify(captures, null, 2);
      const exportFile = new FileSystem.File(FileSystem.Paths.cache, 'lifeos-export.json');

      exportFile.create({ overwrite: true });
      exportFile.write(jsonString);
      await Sharing.shareAsync(exportFile.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export LifeOS data',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export data');
    } finally {
      setIsLoading(false);
    }
  };

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
          <Text style={[styles.title, { color: palette.text.primary }]}>Export</Text>
          <Text style={[styles.description, { color: palette.text.secondary }]}>Export all your captures as a JSON file</Text>
          <Pressable
            style={[
              styles.button,
              {
                backgroundColor: palette.accent.brand,
                opacity: isLoading ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              void handleExport();
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={palette.background.primary} />
            ) : (
              <Text style={[styles.buttonText, { color: palette.background.primary }]}>
                Export as JSON
              </Text>
            )}
          </Pressable>
          {error ? <ErrorBanner message={error} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  scrollContent: {
    paddingBottom: spacing[8],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[3],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  description: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 24,
  },
  button: {
    minHeight: 44,
    borderRadius: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  buttonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});