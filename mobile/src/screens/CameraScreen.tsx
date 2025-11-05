import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Camera as ExpoCamera, CameraType } from 'expo-camera/legacy';
import * as ImagePicker from 'expo-image-picker';
import { X, SwitchCamera, Images, Camera } from 'lucide-react-native';
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography, borderRadius } from '@/lib/ui-tokens';
import { useAppDispatch } from '@/store';
import { addSelectedImage } from '@/store/slices/imageSlice';
// Future: Use RTK Query + XState for upload orchestration (TASK-0819)
// import { useUploadMachine, useRequestPresignUrlMutation, uploadToS3 } from '@/features/upload/public';

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

type CameraScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Camera'>,
  StackNavigationProp<RootStackParamList>
>;

interface CameraScreenProps {
  navigation: CameraScreenNavigationProp;
}

export const CameraScreen = ({ navigation }: CameraScreenProps) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [type, setType] = useState(CameraType.back);
  const [isReady, setIsReady] = useState(false);
  const cameraRef = useRef<ExpoCamera>(null);
  const dispatch = useAppDispatch();

  useEffect(() => {
    (async () => {
      const { status } = await ExpoCamera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const takePicture = async () => {
    if (cameraRef.current && isReady) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
        });

        // Convert to ImagePickerAsset format for consistency
        const imageAsset: ImagePicker.ImagePickerAsset = {
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
          type: 'image',
          fileName: `photo_${Date.now()}.jpg`,
          exif: photo.exif,
          mimeType: 'image/jpeg',
        };

        dispatch(addSelectedImage(imageAsset));
        navigation.navigate('Edit');
      } catch {
        Alert.alert('Error', 'Failed to take picture');
      }
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library permission');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      result.assets.forEach(asset => {
        dispatch(addSelectedImage(asset));
      });
      navigation.navigate('Edit');
    }
  };

  const toggleCameraType = () => {
    setType(type === CameraType.back ? CameraType.front : CameraType.back);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.permissionContainer}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Camera size={64} color={colors.textSecondary} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          Please enable camera permission in settings to take photos
        </Text>
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={pickFromGallery}
        >
          <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCamera
        ref={cameraRef}
        style={styles.camera}
        type={type}
        onCameraReady={() => setIsReady(true)}
      />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <X size={28} color={colors.textInverse} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Take Photo</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={toggleCameraType}
          >
            <SwitchCamera size={28} color={colors.textInverse} />
          </TouchableOpacity>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.galleryButton}
            onPress={pickFromGallery}
          >
            <Images size={24} color={colors.textInverse} />
            <Text style={styles.controlText}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.captureButton,
              !isReady && styles.captureButtonDisabled,
            ]}
            onPress={takePicture}
            disabled={!isReady}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <View style={styles.placeholder} />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cameraBackground,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textInverse,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl - 8, // 40px
    paddingBottom: spacing.xxl - 8, // 40px
  },
  galleryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  controlText: {
    color: colors.textInverse,
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    backgroundColor: colors.surfaceDisabled,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  placeholder: {
    width: 60,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl - 8, // 40px
    backgroundColor: colors.background,
  },
  permissionTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: spacing.lg,
    marginBottom: spacing.xl,
  },
  galleryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textInverse,
  },
});