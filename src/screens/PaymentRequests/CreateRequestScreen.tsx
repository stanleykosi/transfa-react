/**
 * @description
 * This screen provides a form for users to create a new payment request.
 * It allows specifying an amount, an optional description, and an optional image.
 * The image is first uploaded to Supabase Storage, and then the request details
 * are sent to the backend.
 *
 * @dependencies
 * - react, react-native: For UI and state management.
 * - @react-navigation/native: For navigation.
 * - @/components/*: Reusable UI components.
 * - @/api/transactionApi: For the `useCreatePaymentRequest` mutation hook.
 * - react-native-image-picker: For selecting images from the device.
 * - @/api/supabaseClient: For uploading images to Supabase Storage.
 * - @/utils/formatCurrency: For handling currency conversion.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'react-native-image-picker';
import { AppStackParamList } from '@/navigation/AppStack';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useCreatePaymentRequest } from '@/api/transactionApi';
import { nairaToKobo } from '@/utils/formatCurrency';
import { uploadImage } from '@/api/supabaseClient';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const CreateRequestScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<ImagePicker.Asset | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { mutate: createRequest, isPending: isCreating } = useCreatePaymentRequest({
    onSuccess: (data) => {
      // On success, navigate to a new screen to show the QR code and link.
      navigation.replace('PaymentRequestSuccess', { requestId: data.id });
    },
    onError: (error) => {
      Alert.alert('Creation Failed', error.message || 'Could not create the payment request.');
    },
  });

  const handleSelectImage = () => {
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.7,
      },
      (response) => {
        if (response.didCancel) {
          console.log('User cancelled image picker');
        } else if (response.errorCode) {
          Alert.alert('Image Picker Error', response.errorMessage || 'Something went wrong.');
        } else if (response.assets && response.assets.length > 0) {
          setImage(response.assets[0]);
        }
      }
    );
  };

  const handleSubmit = async () => {
    const amountInKobo = nairaToKobo(parseFloat(amount));

    if (isNaN(amountInKobo) || amountInKobo <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    let imageUrl: string | undefined;
    if (image) {
      setIsUploading(true);
      try {
        imageUrl = await uploadImage(image);
      } catch (error) {
        Alert.alert('Upload Failed', 'Could not upload the image. Please try again.');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    createRequest({
      amount: amountInKobo,
      description: description.trim() || undefined,
      image_url: imageUrl,
    });
  };

  const isLoading = isCreating || isUploading;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Create Request</Text>
        <View style={{ width: 24 }} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <FormInput
            label="Amount (₦)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="numeric"
          />

          <FormInput
            label="Description (Optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g., For dinner last night"
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Image (Optional)</Text>
          <TouchableOpacity style={styles.imagePicker} onPress={handleSelectImage}>
            {image ? (
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={32} color={theme.colors.textSecondary} />
                <Text style={styles.imagePickerText}>Tap to select an image</Text>
              </>
            )}
          </TouchableOpacity>
          {isUploading && (
            <View style={styles.uploadingIndicator}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.uploadingText}>Uploading image...</Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <PrimaryButton
              title={isLoading ? 'Creating...' : 'Create Payment Request'}
              onPress={handleSubmit}
              isLoading={isLoading}
              disabled={isLoading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.s24,
  },
  backButton: { padding: theme.spacing.s4 },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
  },
  label: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
  },
  imagePicker: {
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.radii.lg,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  imagePickerText: {
    marginTop: theme.spacing.s8,
    color: theme.colors.textSecondary,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radii.lg,
  },
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.s8,
  },
  uploadingText: {
    marginLeft: theme.spacing.s8,
    color: theme.colors.textSecondary,
  },
  buttonContainer: {
    marginTop: 'auto',
    paddingTop: theme.spacing.s32,
  },
});

export default CreateRequestScreen;
