import { FlashList } from '@shopify/flash-list';
import React, { useMemo } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/lib/ui-tokens';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

type JobItem = {
  readonly id: string;
  readonly name: string;
  readonly status: JobStatus;
  readonly timestamp: string;
};

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: colors.textSecondary,
  processing: colors.primary,
  completed: colors.success,
  failed: colors.error,
};

// Mock data for FlashList v2 vertical list demonstration
const MOCK_JOB_ITEMS: readonly JobItem[] = [
  { id: 'job-1', name: 'Photo Enhancement', status: 'completed', timestamp: '2025-11-10 10:30' },
  { id: 'job-2', name: 'Background Removal', status: 'processing', timestamp: '2025-11-10 10:45' },
  { id: 'job-3', name: 'Color Correction', status: 'pending', timestamp: '2025-11-10 11:00' },
  { id: 'job-4', name: 'Resize Batch', status: 'completed', timestamp: '2025-11-09 15:20' },
  { id: 'job-5', name: 'Filter Application', status: 'failed', timestamp: '2025-11-09 14:10' },
  { id: 'job-6', name: 'Crop & Rotate', status: 'completed', timestamp: '2025-11-09 12:05' },
];

export const JobsScreen = () => {
  // Memoize items to prevent unnecessary re-renders (analyzability, performance)
  const items = useMemo(() => MOCK_JOB_ITEMS, []);

  const renderItem = ({ item }: { readonly item: JobItem }) => {
    return (
      <View style={styles.jobCard}>
        <View style={styles.jobHeader}>
          <Text style={styles.jobName}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status]}20` }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <Text style={styles.subtitle}>FlashList v2 vertical list demonstration</Text>
      </View>
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  jobName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.xs,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
  timestamp: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});