import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

export const docPortalTheme = defineTheme({
  name: 'doc-portal',
  extends: neutralTheme,
  tokens: {
    '--color-accent': '#0284c7',
    '--color-accent-muted': '#e0f2fe',
    '--color-text-accent': '#0369a1',
    '--color-icon-accent': '#0284c7',
    '--color-on-accent': '#ffffff',
    '--color-background-body': '#f8fafc',
    '--color-background-muted': '#f1f5f9',
    '--color-text-primary': '#0f172a',
    '--color-text-secondary': '#64748b',
    '--color-border': '#e2e8f0',
    '--color-border-emphasized': '#cbd5e1',
  },
});
