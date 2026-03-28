import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

export const colors = {
  light: lightColors,
  dark: darkColors,
} as const;

export const theme = {
  colors,
  spacing,
  typography,
} as const;

export type AppTheme = {
  colors: (typeof colors)['light'] | (typeof colors)['dark'];
};
