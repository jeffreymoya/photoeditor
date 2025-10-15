import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';

import { useAppSelector } from '@/store';

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

  const quickActions = [
    {
      title: 'Take Photo',
      icon: 'camera' as const,
      action: () => navigation.navigate('Camera'),
      color: '#007AFF',
    },
    {
      title: 'Select from Gallery',
      icon: 'images' as const,
      action: () => navigation.navigate('Gallery'),
      color: '#34C759',
    },
    {
      title: 'View Jobs',
      icon: 'list' as const,
      action: () => navigation.navigate('Jobs'),
      color: '#FF9500',
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
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.quickAction, { borderColor: action.color }]}
                onPress={action.action}
              >
                <Ionicons
                  name={action.icon}
                  size={32}
                  color={action.color}
                  style={styles.quickActionIcon}
                />
                <Text style={styles.quickActionText}>{action.title}</Text>
              </TouchableOpacity>
            ))}
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
                  <Text style={styles.jobStatusText}>{job.status}</Text>
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
      return '#34C759';
    case 'processing':
      return '#FF9500';
    case 'failed':
      return '#FF3B30';
    default:
      return '#8E8E93';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1d1d1f',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: '#86868b',
    lineHeight: 22,
  },
  section: {
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1d1d1f',
  },
  viewAllText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '500',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  quickAction: {
    flex: 1,
    minWidth: 100,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  quickActionIcon: {
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1d1d1f',
    textAlign: 'center',
  },
  jobItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  jobInfo: {
    flex: 1,
  },
  jobPrompt: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1d1d1f',
    marginBottom: 4,
  },
  jobTime: {
    fontSize: 14,
    color: '#86868b',
  },
  jobStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 12,
  },
  jobStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textTransform: 'uppercase',
  },
});