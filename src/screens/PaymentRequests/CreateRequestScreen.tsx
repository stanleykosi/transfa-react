import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'react-native-image-picker';

import { useUserSearch } from '@/api/userDiscoveryApi';
import { useAccountBalance, useCreatePaymentRequest, useUserProfile } from '@/api/transactionApi';
import { uploadImage } from '@/api/supabaseClient';
import { AppStackParamList } from '@/navigation/AppStack';
import type { UserDiscoveryResult } from '@/types/api';
import { nairaToKobo, formatCurrency } from '@/utils/formatCurrency';

const BRAND_YELLOW = '#FFD300';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type RequestMode = 'general' | 'individual';

const stripUsernamePrefix = (value?: string | null) => (value || 'new_user').replace(/^_+/, '');

const CreateRequestScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const { data: profile } = useUserProfile();
  const { data: balanceData, isLoading: isLoadingBalance } = useAccountBalance();

  const [mode, setMode] = useState<RequestMode>('general');
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<UserDiscoveryResult | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<ImagePicker.Asset | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const normalizedQuery = useMemo(() => username.trim(), [username]);
  const searchQuery = mode === 'individual' && !selectedRecipient ? normalizedQuery : '';
  const { data: searchData, isLoading: isSearching } = useUserSearch(searchQuery, 10);

  const { mutate: createRequest, isPending: isCreating } = useCreatePaymentRequest({
    onSuccess: (data) => {
      navigation.replace('PaymentRequestSuccess', { requestId: data.id });
    },
    onError: (error) => {
      Alert.alert('Request failed', error.message || 'Could not create payment request.');
    },
  });

  const isSubmitting = isUploading || isCreating;

  const buttonLabel = useMemo(() => {
    if (isSubmitting) {
      return mode === 'general' ? 'Creating request...' : 'Sending request...';
    }
    return mode === 'general' ? 'Create request' : 'Send request';
  }, [isSubmitting, mode]);

  const selectImage = () => {
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
      },
      (response) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          Alert.alert('Upload image', response.errorMessage || 'Unable to select image.');
          return;
        }
        if (response.assets && response.assets.length > 0) {
          setImage(response.assets[0]);
        }
      }
    );
  };

  const submit = async () => {
    const trimmedTitle = title.trim();
    const amountNumber = parseFloat(amount.replace(/,/g, '').trim());
    const amountInKobo = nairaToKobo(amountNumber);

    if (trimmedTitle.length < 3) {
      Alert.alert('Invalid title', 'Please enter a request title (at least 3 characters).');
      return;
    }

    if (Number.isNaN(amountInKobo) || amountInKobo <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }

    const trimmedDescription = description.trim();

    const trimmedUsername = username.trim();
    if (mode === 'individual' && trimmedUsername.length === 0) {
      Alert.alert('Recipient required', 'Enter the username for this individual request.');
      return;
    }

    const recipientUsername = selectedRecipient
      ? stripUsernamePrefix(selectedRecipient.username)
      : trimmedUsername;
    if (mode === 'individual' && !selectedRecipient) {
      Alert.alert('Select recipient', 'Select a user from search results to continue.');
      return;
    }
    if (
      mode === 'individual' &&
      stripUsernamePrefix(profile?.username).toLowerCase() === recipientUsername.toLowerCase()
    ) {
      Alert.alert('Invalid recipient', 'You cannot create an individual request for yourself.');
      return;
    }

    let imageURL: string | undefined;
    if (image) {
      setIsUploading(true);
      try {
        imageURL = await uploadImage(image);
      } catch (error: any) {
        Alert.alert('Upload failed', error?.message || 'Could not upload selected image.');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    createRequest({
      request_type: mode,
      title: trimmedTitle,
      recipient_username: mode === 'individual' ? recipientUsername : undefined,
      amount: amountInKobo,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      image_url: imageURL,
    });
  };

  const handleModeChange = (nextMode: RequestMode) => {
    setMode(nextMode);
    if (nextMode === 'general') {
      setUsername('');
      setSelectedRecipient(null);
    }
  };

  const handleSelectRecipient = (user: UserDiscoveryResult) => {
    setSelectedRecipient(user);
    setUsername(stripUsernamePrefix(user.username));
  };

  const clearRecipient = () => {
    setSelectedRecipient(null);
    setUsername('');
  };

  const usernameDisplay = stripUsernamePrefix(profile?.username);
  const activeSearchResults = searchData?.users ?? [];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', '#050607']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="#F2F2F2" />
            </TouchableOpacity>

            <View style={styles.identityRow}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarInitial}>
                  {usernameDisplay.slice(0, 1).toUpperCase()}
                </Text>
              </View>

              <View style={styles.userTextWrap}>
                <Text style={styles.userName}>{usernameDisplay}</Text>
                <View style={styles.userLockBadge}>
                  <Ionicons name="lock-closed" size={8} color="#0A0A0A" />
                </View>
              </View>

              <View style={styles.headerIcons}>
                <Ionicons name="wallet-outline" size={18} color="#ECEDEE" />
                <Ionicons name="notifications-outline" size={17} color="#ECEDEE" />
              </View>
            </View>

            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
              <View style={styles.balanceRow}>
                {isLoadingBalance ? (
                  <ActivityIndicator size="small" color={BRAND_YELLOW} />
                ) : (
                  <Text style={styles.balanceValue}>
                    {formatCurrency(balanceData?.available_balance ?? 0)}
                  </Text>
                )}
                <Ionicons name="eye-off-outline" size={18} color="#C7C8CB" style={styles.eyeIcon} />
              </View>
            </View>

            <View style={styles.topSegmentWrap}>
              <TouchableOpacity
                style={[styles.topSegmentButton, styles.topSegmentInactive]}
                activeOpacity={0.9}
              >
                <Ionicons name="link-outline" size={14} color="#C3C4C7" />
                <Text style={styles.topSegmentText}>My Link</Text>
              </TouchableOpacity>

              <View style={[styles.topSegmentButton, styles.topSegmentActive]}>
                <Ionicons name="receipt-outline" size={14} color="#E7E8EA" />
                <Text style={styles.topSegmentText}>Request</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.modeSegmentWrap}>
              <TouchableOpacity
                style={[
                  styles.modeSegmentButton,
                  mode === 'general' && styles.modeSegmentButtonActive,
                ]}
                onPress={() => handleModeChange('general')}
                activeOpacity={0.88}
              >
                <Text
                  style={[
                    styles.modeSegmentText,
                    mode === 'general' && styles.modeSegmentTextActive,
                  ]}
                >
                  General Request
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeSegmentButton,
                  mode === 'individual' && styles.modeSegmentButtonActive,
                ]}
                onPress={() => handleModeChange('individual')}
                activeOpacity={0.88}
              >
                <Text
                  style={[
                    styles.modeSegmentText,
                    mode === 'individual' && styles.modeSegmentTextActive,
                  ]}
                >
                  Individual Request
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              {mode === 'individual' ? (
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Username</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="person-outline" size={14} color="#A3A5AA" />
                    <TextInput
                      value={username}
                      onChangeText={(value) => {
                        setUsername(value);
                        if (selectedRecipient) {
                          const selectedName = stripUsernamePrefix(selectedRecipient.username);
                          if (selectedName.toLowerCase() !== value.trim().toLowerCase()) {
                            setSelectedRecipient(null);
                          }
                        }
                      }}
                      placeholder="Enter Username"
                      placeholderTextColor="#93959A"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                    />
                  </View>

                  {selectedRecipient ? (
                    <View style={styles.selectedRecipientCard}>
                      <View style={styles.searchResultAvatar}>
                        <Text style={styles.searchResultAvatarInitial}>
                          {(
                            selectedRecipient.full_name?.slice(0, 1) ||
                            stripUsernamePrefix(selectedRecipient.username).slice(0, 1)
                          ).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.selectedRecipientTextWrap}>
                        <Text style={styles.searchResultUsername}>
                          {stripUsernamePrefix(selectedRecipient.username)}
                        </Text>
                        <Text style={styles.searchResultFullName} numberOfLines={1}>
                          {selectedRecipient.full_name || 'Transfa User'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={clearRecipient}
                        hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                      >
                        <Ionicons name="close" size={18} color="#161719" />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {!selectedRecipient && normalizedQuery.length > 0 ? (
                    isSearching ? (
                      <View style={styles.searchLoadingWrap}>
                        <ActivityIndicator size="small" color={BRAND_YELLOW} />
                      </View>
                    ) : activeSearchResults.length === 0 ? (
                      <Text style={styles.emptySearchText}>No users found.</Text>
                    ) : (
                      <View style={styles.searchResultList}>
                        {activeSearchResults.map((user) => (
                          <TouchableOpacity
                            key={user.id}
                            style={styles.searchResultCard}
                            activeOpacity={0.88}
                            onPress={() => handleSelectRecipient(user)}
                          >
                            <View style={styles.searchResultAvatar}>
                              <Text style={styles.searchResultAvatarInitial}>
                                {(
                                  user.full_name?.slice(0, 1) ||
                                  stripUsernamePrefix(user.username).slice(0, 1)
                                ).toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.selectedRecipientTextWrap}>
                              <Text style={styles.searchResultUsername}>
                                {stripUsernamePrefix(user.username)}
                              </Text>
                              <Text style={styles.searchResultFullName} numberOfLines={1}>
                                {user.full_name || 'Transfa User'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )
                  ) : null}
                </View>
              ) : null}

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Add title"
                  placeholderTextColor="#93959A"
                  style={[styles.input, styles.standaloneInput]}
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Amount</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="cash-outline" size={14} color="#A3A5AA" />
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="Amount"
                    placeholderTextColor="#93959A"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add description"
                  placeholderTextColor="#93959A"
                  style={[styles.input, styles.standaloneInput]}
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Upload image (Optional)</Text>
                <TouchableOpacity
                  style={styles.uploadCard}
                  onPress={selectImage}
                  activeOpacity={0.85}
                >
                  {image?.uri ? (
                    <Image source={{ uri: image.uri }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Ionicons name="cloud-upload-outline" size={24} color="#6F7279" />
                      <Text style={styles.uploadMainText}>
                        Choose a file or drag & drop it here
                      </Text>
                      <Text style={styles.uploadSubText}>JPEG & PNG formats, up to 50mb</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {image?.uri ? (
                  <TouchableOpacity onPress={() => setImage(null)} style={styles.removeImageButton}>
                    <Text style={styles.removeImageText}>Remove image</Text>
                  </TouchableOpacity>
                ) : null}

                {isUploading ? (
                  <View style={styles.uploadingWrap}>
                    <ActivityIndicator size="small" color={BRAND_YELLOW} />
                    <Text style={styles.uploadingText}>Uploading image...</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              disabled={isSubmitting}
              onPress={submit}
              activeOpacity={0.9}
            >
              <Text style={styles.submitButtonText}>{buttonLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050607',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  backButton: {
    width: 28,
    paddingVertical: 4,
  },
  identityRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F4DDB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#151618',
    fontSize: 14,
    fontWeight: '700',
  },
  userTextWrap: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userName: {
    color: '#EFEFF0',
    fontSize: 18,
    fontWeight: '700',
  },
  userLockBadge: {
    marginLeft: 4,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceSection: {
    marginTop: 14,
  },
  balanceLabel: {
    color: '#B5B7BC',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  balanceRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceValue: {
    color: '#F5F5F6',
    fontSize: 40,
    fontWeight: '700',
  },
  eyeIcon: {
    marginLeft: 8,
    marginTop: 3,
  },
  topSegmentWrap: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  topSegmentButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  topSegmentInactive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  topSegmentActive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: BRAND_YELLOW,
  },
  topSegmentText: {
    color: '#D6D7DA',
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    marginTop: 16,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  modeSegmentWrap: {
    marginTop: 16,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    padding: 2,
  },
  modeSegmentButton: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSegmentButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  modeSegmentText: {
    color: '#8C8F96',
    fontSize: 13,
    fontWeight: '600',
  },
  modeSegmentTextActive: {
    color: '#F1F1F2',
  },
  form: {
    marginTop: 12,
    gap: 12,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    color: '#E6E7EA',
    fontSize: 13,
    fontWeight: '500',
  },
  inputWrap: {
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#ECEDEF',
    fontSize: 13,
    paddingVertical: 0,
  },
  standaloneInput: {
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
  },
  searchLoadingWrap: {
    marginTop: 10,
    alignItems: 'center',
  },
  emptySearchText: {
    marginTop: 10,
    color: '#9FA1A7',
    fontSize: 12,
  },
  searchResultList: {
    marginTop: 10,
    gap: 8,
  },
  searchResultCard: {
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedRecipientCard: {
    marginTop: 10,
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchResultAvatar: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultAvatarInitial: {
    color: '#111',
    fontSize: 13,
    fontWeight: '700',
  },
  selectedRecipientTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  searchResultUsername: {
    color: '#17181B',
    fontSize: 16,
    fontWeight: '700',
  },
  searchResultFullName: {
    marginTop: 1,
    color: '#5F6268',
    fontSize: 12,
  },
  uploadCard: {
    minHeight: 108,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadMainText: {
    marginTop: 8,
    color: '#B6B8BE',
    fontSize: 12,
  },
  uploadSubText: {
    marginTop: 2,
    color: '#7E8188',
    fontSize: 10,
  },
  previewImage: {
    width: '100%',
    height: 150,
  },
  removeImageButton: {
    alignSelf: 'flex-start',
  },
  removeImageText: {
    color: BRAND_YELLOW,
    fontSize: 12,
    fontWeight: '600',
  },
  uploadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadingText: {
    color: '#C7C9CD',
    fontSize: 12,
  },
  submitButton: {
    marginTop: 8,
    height: 50,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#121316',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default CreateRequestScreen;
