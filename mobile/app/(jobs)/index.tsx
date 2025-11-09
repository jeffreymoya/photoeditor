import { Link } from 'expo-router';
import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/lib/ui-tokens';

/**
 * Jobs list screen using Expo Router file-based routing.
 *
 * This screen displays the list of photo processing jobs.
 * Implements file-based routing per standards/frontend-tier.md#feature-guardrails.
 */
export const JobsIndexScreen = () => {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Jobs</Text>
      <Text style={styles.subtitle}>Track your photo processing jobs</Text>

      {/* Example link to job detail - replace with actual job list */}
      <Link href="/jobs/example-job-123" style={styles.link}>
        <Text style={styles.linkText}>View Example Job</Text>
      </Link>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  link: {
    marginTop: spacing.md,
  },
  linkText: {
    fontSize: typography.sizes.md,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});

export default JobsIndexScreen;
