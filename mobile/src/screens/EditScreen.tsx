import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useServices } from '@/features/upload/context/ServiceContext';
import { colors, spacing, typography, borderRadius } from '@/lib/ui-tokens';
import type { IUploadService } from '@/services/upload/port';
import { useAppSelector } from '@/store';

// Helper: Process single image
const processSingleImage = async (
  uploadService: IUploadService,
  image: ImagePicker.ImagePickerAsset,
  prompt: string,
  onProgress: (progress: number) => void
): Promise<string> => {
  const fileName = image.fileName || `image_${Date.now()}.jpg`;
  const fileSize = image.fileSize || 1024 * 1024;

  const downloadUrl = await uploadService.processImage(
    image.uri,
    fileName,
    fileSize,
    prompt,
    onProgress
  );

  return downloadUrl;
};

// Helper: Process multiple images
const processMultipleImages = async (
  uploadService: IUploadService,
  images: ImagePicker.ImagePickerAsset[],
  prompt: string,
  individualPrompts: string[],
  onProgress: (progress: number, batchId?: string) => void
): Promise<string[]> => {
  const mappedImages = images.map(img => {
    const result: { uri: string; fileName?: string; fileSize?: number } = {
      uri: img.uri,
    };
    if (img.fileName != null) result.fileName = img.fileName;
    if (img.fileSize != null) result.fileSize = img.fileSize;
    return result;
  });

  const downloadUrls = await uploadService.processBatchImages(
    mappedImages,
    prompt,
    individualPrompts.length > 0 ? individualPrompts : undefined,
    onProgress
  );

  return downloadUrls;
};

// Sub-component: Image selection section
interface ImageSectionProps {
  selectedImages: ImagePicker.ImagePickerAsset[];
  onSelectImage: () => void;
}

const ImageSection: React.FC<ImageSectionProps> = ({ selectedImages, onSelectImage }) => (
  <View style={styles.imageSection}>
    {selectedImages.length > 0 ? (
      <ScrollView horizontal style={styles.imageGrid} showsHorizontalScrollIndicator={false}>
        {selectedImages.map((image, index) => (
          <Image key={index} source={{ uri: image.uri }} style={styles.selectedImage} />
        ))}
      </ScrollView>
    ) : (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.placeholderText}>No images selected</Text>
      </View>
    )}
    <TouchableOpacity style={styles.selectButton} onPress={onSelectImage}>
      <Text style={styles.buttonText}>
        {selectedImages.length > 0 ? 'Change Images' : 'Select Images'}
      </Text>
    </TouchableOpacity>
  </View>
);

// Sub-component: Process button
interface ProcessButtonProps {
  selectedImages: ImagePicker.ImagePickerAsset[];
  prompt: string;
  isProcessing: boolean;
  progress: number;
  onPress: () => void;
}

const ProcessButton: React.FC<ProcessButtonProps> = ({
  selectedImages,
  prompt,
  isProcessing,
  progress,
  onPress,
}) => {
  const isDisabled = selectedImages.length === 0 || !prompt.trim() || isProcessing;

  return (
    <TouchableOpacity
      style={[styles.processButton, isDisabled && styles.disabledButton]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {isProcessing ? (
        <View style={styles.processingContent}>
          <ActivityIndicator color="white" size="small" />
          <Text style={styles.buttonText}>
            Processing {selectedImages.length > 1 ? 'Batch' : 'Image'}... {Math.round(progress)}%
          </Text>
        </View>
      ) : (
        <Text style={styles.buttonText}>
          Process {selectedImages.length > 1 ? `${selectedImages.length} Images` : 'Image'}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// Sub-component: Result section
interface ResultSectionProps {
  resultUrls: string[];
}

const ResultSection: React.FC<ResultSectionProps> = ({ resultUrls }) => {
  if (resultUrls.length === 0) return null;

  const handleDownload = () => {
    Alert.alert(
      'Download',
      resultUrls.length > 1
        ? `${resultUrls.length} images are ready for download`
        : 'Image is ready for download',
      [{ text: 'OK', style: 'default' }]
    );
  };

  return (
    <View style={styles.resultSection}>
      <Text style={styles.resultTitle}>
        {resultUrls.length > 1 ? 'All Images Processed!' : 'Image Processed!'}
      </Text>
      <TouchableOpacity style={styles.downloadButton} onPress={handleDownload}>
        <Text style={styles.buttonText}>
          Download {resultUrls.length > 1 ? `${resultUrls.length} Images` : 'Image'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export const EditScreen = () => {
  const { uploadService } = useServices();
  const selectedImages = useAppSelector(state => state.image.selectedImages);
  const [prompt, setPrompt] = useState('');
  const [individualPrompts] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [, setBatchJobId] = useState<string | undefined>();

  const selectImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    };

    const result = await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      setResultUrls([]);
    }
  };

  const processBatchImages = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('Error', 'Please select at least one image');
      return;
    }

    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt describing how you want to edit the images');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);

      const isSingleImage = selectedImages.length === 1;

      if (isSingleImage) {
        const downloadUrl = await processSingleImage(
          uploadService,
          selectedImages[0],
          prompt,
          setProgress
        );
        setResultUrls([downloadUrl]);
        Alert.alert('Success', 'Your image has been processed successfully!');
      } else {
        const downloadUrls = await processMultipleImages(
          uploadService,
          selectedImages,
          prompt,
          individualPrompts,
          (progressValue, batchId) => {
            setProgress(progressValue);
            if (batchId) setBatchJobId(batchId);
          }
        );
        setResultUrls(downloadUrls);
        Alert.alert('Success', `All ${selectedImages.length} images have been processed successfully!`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to process images: ${message}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const subtitle = selectedImages.length === 0
    ? 'Upload photos and describe your desired edits'
    : `${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''} selected`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>AI Photo Editor</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <ImageSection selectedImages={selectedImages} onSelectImage={selectImage} />

        <View style={styles.promptSection}>
          <Text style={styles.promptLabel}>Editing Instructions</Text>
          <TextInput
            style={styles.promptInput}
            placeholder="Describe how you want to edit your photo (e.g., 'Make it brighter and more vibrant', 'Add a vintage filter', 'Enhance the colors')"
            multiline
            numberOfLines={4}
            value={prompt}
            onChangeText={setPrompt}
            textAlignVertical="top"
          />
        </View>

        <ProcessButton
          selectedImages={selectedImages}
          prompt={prompt}
          isProcessing={isProcessing}
          progress={progress}
          onPress={processBatchImages}
        />

        <ResultSection resultUrls={resultUrls} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.sizes.xxxl - 4,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl - 2,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: spacing.xl - 2,
  },
  imageGrid: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  selectedImage: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.lg,
    marginRight: spacing.md,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: 300,
    height: 300,
    backgroundColor: colors.border,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.divider,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
  selectButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  promptSection: {
    marginBottom: spacing.xl - 2,
  },
  promptLabel: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  promptInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.divider,
    minHeight: 100,
  },
  processButton: {
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.xl - 2,
  },
  disabledButton: {
    backgroundColor: colors.divider,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  processingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultSection: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  resultTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.success,
    marginBottom: spacing.md,
  },
  downloadButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
});