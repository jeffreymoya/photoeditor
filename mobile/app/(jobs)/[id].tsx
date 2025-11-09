import { useLocalSearchParams, Link } from 'expo-router';
import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/lib/ui-tokens';

/**
 * Job detail screen using Expo Router file-based routing.
 *
 * This screen displays details for a specific photo processing job.
 * Uses dynamic route parameter [id] per Expo Router conventions.
 * Implements file-based routing per standards/frontend-tier.md#feature-guardrails.
 */
export const JobDetailScreen = () => {
  // Use Expo Router's typed route params
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Job Details</Text>

      <View style={styles.detailCard}>
        <Text style={styles.label}>Job ID:</Text>
        <Text style={styles.value}>{id}</Text>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>Processing...</Text>
      </View>

      <Link href="/jobs" style={styles.backLink}>
        <Text style={styles.backLinkText}>← Back to Jobs</Text>
      </Link>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  detailCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  backLink: {
    marginTop: spacing.lg,
  },
  backLinkText: {
    fontSize: typography.sizes.md,
    color: colors.primary,
  },
});

export default JobDetailScreen;
