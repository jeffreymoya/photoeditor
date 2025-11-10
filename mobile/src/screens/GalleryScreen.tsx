import { FlashList } from '@shopify/flash-list';
import React, { useMemo } from 'react';
import { Text, StyleSheet, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/lib/ui-tokens';
// Future: Use RTK Query + XState for batch upload orchestration (TASK-0819)
// import { useUploadMachine, useRequestBatchPresignUrlsMutation } from '@/features/upload/public';

type GalleryItem = {
  readonly id: string;
  readonly uri: string;
  readonly aspectRatio: number;
};

const COLUMN_GAP = spacing.sm;
const NUM_COLUMNS = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = (SCREEN_WIDTH - (NUM_COLUMNS + 1) * COLUMN_GAP) / NUM_COLUMNS;

// Mock data for FlashList v2 masonry layout demonstration
const MOCK_GALLERY_ITEMS: readonly GalleryItem[] = [
  { id: '1', uri: 'https://via.placeholder.com/300x400', aspectRatio: 0.75 },
  { id: '2', uri: 'https://via.placeholder.com/300x300', aspectRatio: 1.0 },
  { id: '3', uri: 'https://via.placeholder.com/300x500', aspectRatio: 0.6 },
  { id: '4', uri: 'https://via.placeholder.com/300x350', aspectRatio: 0.86 },
  { id: '5', uri: 'https://via.placeholder.com/300x450', aspectRatio: 0.67 },
  { id: '6', uri: 'https://via.placeholder.com/300x300', aspectRatio: 1.0 },
];

export const GalleryScreen = () => {
  // Memoize items to prevent unnecessary re-renders (analyzability, performance)
  const items = useMemo(() => MOCK_GALLERY_ITEMS, []);

  const renderItem = ({ item }: { readonly item: GalleryItem }) => {
    const itemHeight = ITEM_WIDTH / item.aspectRatio;

    return (
      <View style={[styles.imageContainer, { width: ITEM_WIDTH, height: itemHeight }]}>
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.border }]}>
          <Text style={styles.placeholderText}>{item.id}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Gallery</Text>
        <Text style={styles.subtitle}>FlashList v2 masonry layout demonstration</Text>
      </View>
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
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
    paddingHorizontal: COLUMN_GAP,
    paddingTop: spacing.sm,
  },
  imageContainer: {
    padding: COLUMN_GAP / 2,
  },
  imagePlaceholder: {
    flex: 1,
    borderRadius: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
});