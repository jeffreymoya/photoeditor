import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Camera, Images, List } from 'lucide-react-native';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHealthCheckQuery } from '@/features/upload/public';
import { colors, spacing, typography, shadows, borderRadius } from '@/lib/ui-tokens';
import { useAppSelector } from '@/store';
// RTK Query health check per the Frontend Tier standard: RTK Query mandated for network calls

type RootStackParamList = {
  Tabs: undefined;
  Edit: undefined;
  Preview: undefined;
};

type TabParamList = {
  Home: undefined;
  Camera: undefined;
  Gallery: undefined;
  Jobs: undefined;
  Settings: undefined;
};

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Home'>,
  StackNavigationProp<RootStackParamList>
>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

export const HomeScreen = ({ navigation }: HomeScreenProps) => {
  const { jobs } = useAppSelector((state) => state.job);
  const recentJobs = jobs.slice(0, 5);

  // Example: Health check using RTK Query (TASK-0819)
  // Per the Frontend Tier standard: RTK Query mandated for network calls
  const { data: _healthData } = useHealthCheckQuery(undefined, {
    pollingInterval: 60000, // Poll every 60s
    skip: false,
  });

  const quickActions = [
    {
      title: 'Take Photo',
      icon: Camera,
      action: () => navigation.navigate('Camera'),
      color: colors.primary,
    },
    {
      title: 'Select from Gallery',
      icon: Images,
      action: () => navigation.navigate('Gallery'),
      color: colors.success,
    },
    {
      title: 'View Jobs',
      icon: List,
      action: () => navigation.navigate('Jobs'),
      color: colors.warning,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Photo Editor</Text>
          <Text style={styles.subtitle}>
            Transform your photos with AI-powered editing
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.quickAction, { borderColor: action.color }]}
                  onPress={action.action}
                >
                  <Icon
                    size={32}
                    color={action.color}
                    style={styles.quickActionIcon}
                  />
                  <Text style={styles.quickActionText}>{action.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {recentJobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Jobs</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Jobs')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            {recentJobs.map((job) => (
              <View key={job.id} style={styles.jobItem}>
                <View style={styles.jobInfo}>
                  <Text style={styles.jobPrompt} numberOfLines={1}>
                    {job.prompt}
                  </Text>
                  <Text style={styles.jobTime}>
                    {new Date(job.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.jobStatus,
                    { backgroundColor: getStatusColor(job.status) },
                  ]}
                >
                  <Text style={styles.jobStatusText}>{job.status.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'processing':
      return colors.warning;
    case 'failed':
      return colors.error;
    default:
      return colors.textSecondary;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xl,
  },
  section: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  viewAllText: {
    fontSize: typography.sizes.md,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  quickAction: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.md,
  },
  quickActionIcon: {
    marginBottom: spacing.sm,
  },
  quickActionText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  jobItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  jobInfo: {
    flex: 1,
  },
  jobPrompt: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  jobTime: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  jobStatus: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    marginLeft: spacing.md,
  },
  jobStatusText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textInverse,
    textTransform: 'uppercase',
  },
});
