import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

type MoreRow = {
  label: string;
  onPress: () => void;
  comingSoon?: boolean;
};

export default function MoreScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const router = useRouter();

  const rows: MoreRow[] = [
    {
      label: 'Settings',
      onPress: () => router.push('/(tabs)/settings'),
    },
    {
      label: 'Memory',
      onPress: () => { /* stub */ },
      comingSoon: true,
    },
    {
      label: 'Integrations',
      onPress: () => { /* stub */ },
      comingSoon: true,
    },
    {
      label: 'Diagnostics',
      onPress: () => { /* stub */ },
      comingSoon: true,
    },
    {
      label: 'Export',
      onPress: () => { /* stub */ },
      comingSoon: true,
    },
  ];

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
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              style={[
                styles.rowBetween,
                index < rows.length - 1
                  ? [styles.rowBorder, { borderBottomColor: palette.border.subtle }]
                  : null,
              ]}
              onPress={row.onPress}
            >
              <Text style={[styles.labelText, { color: palette.text.primary }]}>{row.label}</Text>
              {row.comingSoon ? (
                <View
                  style={[styles.comingSoonBadge, { backgroundColor: palette.background.secondary }]}
                >
                  <Text style={[styles.comingSoonText, { color: palette.text.muted }]}>
                    Coming soon
                  </Text>
                </View>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={typography.fontSize.base}
                  color={palette.text.muted}
                />
              )}
            </Pressable>
          ))}
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
    gap: spacing[3],
    paddingBottom: spacing[8],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  labelText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
  },
  comingSoonBadge: {
    borderRadius: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  comingSoonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
