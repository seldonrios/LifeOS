import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

const KNOWN_INTEGRATIONS = [
  {
    id: 'google',
    label: 'Google',
    description: 'Calendar, Tasks, Gmail',
    cliCommand: 'lifeos module authorize google-bridge',
  },
  {
    id: 'home-assistant',
    label: 'Home Assistant',
    description: 'Presence, zones, ambient triggers',
    cliCommand: 'lifeos module authorize home-state',
  },
] as const;

type IntegrationStatus = 'connected' | 'not-connected' | 'unknown';

function getStatusCopy(status: IntegrationStatus): string {
  if (status === 'connected') {
    return 'Connected';
  }
  if (status === 'not-connected') {
    return 'Not connected';
  }
  return 'Status unknown';
}

function getStatusColor(
  status: IntegrationStatus,
  palette: typeof darkColors | typeof lightColors,
): string {
  if (status === 'connected') {
    return palette.accent.success;
  }
  if (status === 'not-connected') {
    return palette.accent.danger;
  }
  return palette.accent.warning;
}

export default function IntegrationsScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.cardsColumn}>
          {KNOWN_INTEGRATIONS.map((integration) => {
            const status: IntegrationStatus = 'unknown';

            return (
              <View
                key={integration.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: palette.background.card,
                    borderColor: palette.border.default,
                  },
                ]}
              >
                <View style={styles.headerRow}>
                  <View style={styles.titleWrap}>
                    <Text style={[styles.title, { color: palette.text.primary }]}>
                      {integration.label}
                    </Text>
                    <Text style={[styles.description, { color: palette.text.secondary }]}>
                      {integration.description}
                    </Text>
                  </View>
                  <View style={styles.statusWrap}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: getStatusColor(status, palette) },
                      ]}
                    />
                    <Text style={[styles.statusText, { color: palette.text.secondary }]}>
                      {getStatusCopy(status)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.commandLabel, { color: palette.text.muted }]}>CLI command</Text>
                <Text
                  style={[
                    styles.commandText,
                    {
                      color: palette.text.primary,
                      backgroundColor: palette.background.secondary,
                      borderColor: palette.border.default,
                    },
                  ]}
                >
                  {integration.cliCommand}
                </Text>
              </View>
            );
          })}
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
  cardsColumn: {
    gap: spacing[3],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  titleWrap: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  description: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 20,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statusDot: {
    width: spacing[2],
    height: spacing[2],
    borderRadius: spacing[1],
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  commandLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commandText: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    fontFamily: 'monospace',
  },
});