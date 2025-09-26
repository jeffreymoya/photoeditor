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
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '../services/ApiService';

export const EditScreen = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const selectImage = async () => {
    // Request permission
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
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
      setSelectedImage(result.assets[0].uri);
      setResultUrl(null); // Reset result when selecting new image
    }
  };

  const processImage = async () => {
    if (!selectedImage) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt describing how you want to edit the image');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);

      // Get file info (simplified for demo - in real app you'd get actual file size)
      const fileName = `image_${Date.now()}.jpg`;
      const fileSize = 1024 * 1024; // Placeholder size

      const downloadUrl = await apiService.processImage(
        selectedImage,
        fileName,
        fileSize,
        prompt,
        (progressValue) => {
          setProgress(progressValue);
        }
      );

      setResultUrl(downloadUrl);
      Alert.alert('Success', 'Your image has been processed successfully!');
    } catch (error) {
      Alert.alert('Error', `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>AI Photo Editor</Text>
        <Text style={styles.subtitle}>Upload a photo and describe your desired edits</Text>

        {/* Image Selection */}
        <View style={styles.imageSection}>
          {selectedImage ? (
            <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>No image selected</Text>
            </View>
          )}
          <TouchableOpacity style={styles.selectButton} onPress={selectImage}>
            <Text style={styles.buttonText}>
              {selectedImage ? 'Change Image' : 'Select Image'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Prompt Input */}
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

        {/* Process Button */}
        <TouchableOpacity
          style={[
            styles.processButton,
            (!selectedImage || !prompt.trim() || isProcessing) && styles.disabledButton,
          ]}
          onPress={processImage}
          disabled={!selectedImage || !prompt.trim() || isProcessing}
        >
          {isProcessing ? (
            <View style={styles.processingContent}>
              <ActivityIndicator color="white" size="small" />
              <Text style={styles.buttonText}>Processing... {Math.round(progress)}%</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Process Image</Text>
          )}
        </TouchableOpacity>

        {/* Result */}
        {resultUrl && (
          <View style={styles.resultSection}>
            <Text style={styles.resultTitle}>Processed Image Ready!</Text>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => {
                Alert.alert('Download', 'Image is ready for download', [
                  { text: 'OK', style: 'default' }
                ]);
              }}
            >
              <Text style={styles.buttonText}>Download</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1d1d1f',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#86868b',
    textAlign: 'center',
    marginBottom: 30,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  selectedImage: {
    width: 300,
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: 300,
    height: 300,
    backgroundColor: '#e5e5e7',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#d1d1d6',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 16,
    color: '#86868b',
  },
  selectButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  promptSection: {
    marginBottom: 30,
  },
  promptLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1d1d1f',
    marginBottom: 12,
  },
  promptInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1d1d1f',
    borderWidth: 1,
    borderColor: '#d1d1d6',
    minHeight: 100,
  },
  processButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  disabledButton: {
    backgroundColor: '#d1d1d6',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  processingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultSection: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d6',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#34C759',
    marginBottom: 16,
  },
  downloadButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
});