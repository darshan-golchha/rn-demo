import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  StatusBar,
  Modal,
  Alert,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { getTwilioClient } from '../engine/twclient';
import { launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from '@react-native-documents/picker';
import ActionSheet from 'react-native-action-sheet';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// Media URL cache to prevent repeated API calls
class MediaCache {
  static cache = new Map();
  
  static get(key) {
    return this.cache.get(key);
  }
  
  static set(key, value) {
    // Limit cache size to prevent memory issues
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  static clear() {
    this.cache.clear();
  }
}

// Memoized Media Message Component
const MediaMessage = memo(({ item }) => {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Check if URL is already cached
    const cachedUrl = MediaCache.get(item.sid);
    if (cachedUrl) {
      setMediaUrl(cachedUrl);
      setLoading(false);
      return;
    }

    const fetchMediaUrl = async () => {
      try {
        if (item.type === 'media') {
          const media = await item.media;
          const url = await media.getContentTemporaryUrl();
          
          // Cache the URL
          MediaCache.set(item.sid, url);
          
          if (isMounted) {
            setMediaUrl(url);
            setLoading(false);
          }
        }
      } catch (e) {
        console.error('Failed to fetch media URL', e);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    fetchMediaUrl();
    return () => { isMounted = false; };
  }, [item.sid]); // Only depend on item.sid, not the entire item

  if (loading) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', height: 120 }}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.mediaPlaceholder}>
        <Text style={styles.mediaText}>Failed to load media</Text>
      </View>
    );
  }

  if (item.media?.contentType?.startsWith('image/')) {
    return (
      <Image
        source={{ uri: mediaUrl }}
        style={styles.messageImage}
        resizeMode="cover"
      />
    );
  }

  if (item.media?.contentType === 'application/pdf') {
    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(mediaUrl)}
        style={{
          padding: 12,
          backgroundColor: '#F3F4F6',
          borderRadius: 12,
          marginBottom: 4,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 18, marginRight: 8 }}>📄</Text>
        <Text
          style={{
            color: '#007AFF',
            textDecorationLine: 'underline',
            fontWeight: '500',
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {item.media.filename || 'Open PDF'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.mediaPlaceholder}>
      <Text style={styles.mediaText}>Unsupported file type</Text>
    </View>
  );
});

// Memoized Message Item Component
const MessageItem = memo(({ item, isGroup, currentUserId }) => {
  const isOwn = item.author === currentUserId;
  
  // Memoize expensive calculations
  const formattedTime = useMemo(() => {
    if (!item.dateCreated) return '';
    const date = new Date(item.dateCreated);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [item.dateCreated]);

  return (
    <View
      style={[
        styles.messageContainer,
        isOwn ? styles.ownMessageContainer : styles.otherMessageContainer,
      ]}
    >
      {isGroup && !isOwn && (
        <Text style={styles.senderName}>{item.author}</Text>
      )}
      
      <View
        style={[
          styles.messageBubble,
          isOwn ? styles.ownMessageBubble : styles.otherMessageBubble,
        ]}
      >
        {item.type === 'media' && item.media ? (
          <MediaMessage item={item} />
        ) : (
          <Text
            style={[
              styles.messageText,
              isOwn ? styles.ownMessageText : styles.otherMessageText,
            ]}
          >
            {item.body}
          </Text>
        )}
        <Text
          style={[
            styles.timestamp,
            isOwn ? styles.ownTimestamp : styles.otherTimestamp,
          ]}
        >
          {formattedTime}
        </Text>
      </View>
    </View>
  );
});

const ChatScreen = ({ route, navigation }) => {
  const { 
    conversationSid, 
    recipientUsername, 
    recipientAvatar,
    isGroup,
    groupName,
    participants
  } = route.params;
  
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]); // Use stable state instead of ref
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [groupInfo, setGroupInfo] = useState({
    participants: participants || [],
    name: groupName || '',
  });
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [showEditGroupName, setShowEditGroupName] = useState(false);
  const [newGroupName, setNewGroupName] = useState(groupName || '');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const flatListRef = useRef(null);
  const client = getTwilioClient();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  // Memoize current user identity
  const currentUserId = useMemo(() => client.user.identity, [client.user.identity]);

  useEffect(() => {
    const setup = async () => {
      try {
        const conv = await client.getConversationBySid(conversationSid);
        setConversation(conv);
        const paginator = await conv.getMessages();
        setMessages(paginator.items);

        if (isGroup) {
          const participants = await conv.getParticipants();
          setGroupInfo(prev => ({
            ...prev,
            participants: participants.map(p => p.identity),
            name: conv.friendlyName || prev.name,
          }));
        }

        conv.on('messageAdded', (msg) => {
          setMessages(prevMessages => [...prevMessages, msg]);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        });

        if (isGroup) {
          conv.on('participantJoined', (participant) => {
            setGroupInfo(prev => ({
              ...prev,
              participants: [...prev.participants, participant.identity]
            }));
          });

          conv.on('participantLeft', (participant) => {
            setGroupInfo(prev => ({
              ...prev,
              participants: prev.participants.filter(p => p !== participant.identity)
            }));
          });

          conv.on('conversationUpdated', ({ conversation }) => {
            if (conversation.friendlyName) {
              setGroupInfo(prev => ({
                ...prev,
                name: conversation.friendlyName
              }));
            }
          });
        }
      } catch (error) {
        console.error('Error setting up conversation:', error);
        Alert.alert('Error', 'Failed to load conversation');
      }
    };
    setup();
  }, [conversationSid, isGroup]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TouchableOpacity 
          onPress={isGroup ? () => setShowGroupInfo(true) : undefined}
          style={styles.headerTitle}
          activeOpacity={isGroup ? 0.7 : 1}
        >
          <Text style={styles.headerTitleText}>
            {isGroup ? groupInfo.name : recipientUsername}
          </Text>
          {isGroup && (
            <Text style={styles.headerSubtitle}>
              {groupInfo.participants.length} participants
            </Text>
          )}
        </TouchableOpacity>
      ),
      headerRight: () => isGroup ? (
        <TouchableOpacity
          onPress={() => setShowGroupInfo(true)}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>ⓘ</Text>
        </TouchableOpacity>
      ) : null,
    });
  }, [navigation, isGroup, groupInfo, recipientUsername]);

  useEffect(() => {
    if (conversation) {
      conversation.setAllMessagesRead().catch(err => {
        console.warn('Failed to mark messages as read:', err);
      });
    }
  }, [conversation]);

  const fetchAvailableUsers = async () => {
    try {
      const token = await require('../engine/token').getToken("token");
      const response = await fetch('http://34.131.11.108/api/users/all', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const usersArray = Array.isArray(data) ? data : data.users || [];
        const filteredUsers = usersArray.filter(user => 
          !groupInfo.participants.includes(user.userName)
        );
        setAvailableUsers(filteredUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const sendTextMessage = async () => {
    if (input.trim()) {
      setIsTyping(true);
      try {
        await conversation.sendMessage(input);
        await conversation.setAllMessagesRead();
        setInput('');
      } catch (error) {
        console.error('Error sending message:', error);
        Alert.alert('Error', 'Failed to send message');
      } finally {
        setIsTyping(false);
      }
    }
  };

  const sendImageMessage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 800,
        maxHeight: 800,
      });

      if (result.didCancel) {
        return;
      }
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to pick image');
        return;
      }
      if (result.assets && result.assets.length > 0) {
        const { uri, fileName, type } = result.assets[0];
        const response = await fetch(uri);
        const blob = await response.blob();
        await conversation.sendMessage({
          contentType: type,
          filename: fileName,
          media: blob,
        });
      } else {
        Alert.alert('No image selected');
      }
    } catch (error) {
      console.error('Error sending image:', error);
      Alert.alert('Error', 'Failed to send image');
    }
  };

  const sendFileMessage = async () => {
    try {
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
      });
      if (!res) return;
      const { uri, name, type } = res;
      const response = await fetch(uri);
      const blob = await response.blob();
      await conversation.sendMessage({
        contentType: type,
        filename: name,
        media: blob,
      });
      Alert.alert('Success', 'File sent');
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
      } else {
        Alert.alert('Error', 'Failed to send file');
      }
    }
  };

  const onAttachPress = () => {
    const options = [
      'Photo',
      'File',
      'Cancel'
    ];
    const cancelButtonIndex = 2;
    ActionSheet.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      async (buttonIndex) => {
        if (buttonIndex === 0) {
          await sendImageMessage();
        } else if (buttonIndex === 1) {
          await sendFileMessage();
        }
      }
    );
  };

  const addParticipants = async () => {
    if (selectedUsers.length === 0) return;
    setLoading(true);
    try {
      for (const userName of selectedUsers) {
        await conversation.add(userName);
      }
      setShowAddParticipants(false);
      setSelectedUsers([]);
      Alert.alert('Success', 'Participants added successfully');
    } catch (error) {
      console.error('Error adding participants:', error);
      Alert.alert('Error', 'Failed to add some participants');
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = async (userName) => {
    Alert.alert(
      'Remove Participant',
      `Are you sure you want to remove ${userName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await conversation.removeParticipant(userName);
              Alert.alert('Success', 'Participant removed successfully');
            } catch (error) {
              console.error('Error removing participant:', error);
              Alert.alert('Error', 'Failed to remove participant');
            }
          }
        }
      ]
    );
  };

  const updateGroupName = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name cannot be empty');
      return;
    }
    setLoading(true);
    try {
      await conversation.updateFriendlyName(newGroupName.trim());
      setGroupInfo(prev => ({ ...prev, name: newGroupName.trim() }));
      setShowEditGroupName(false);
      Alert.alert('Success', 'Group name updated successfully');
    } catch (error) {
      console.error('Error updating group name:', error);
      Alert.alert('Error', 'Failed to update group name');
    } finally {
      setLoading(false);
    }
  };

  const leaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await conversation.leave();
              navigation.goBack();
            } catch (error) {
              console.error('Error leaving group:', error);
              Alert.alert('Error', 'Failed to leave group');
            }
          }
        }
      ]
    );
  };

  const toggleUserSelection = (userName) => {
    setSelectedUsers(prev => 
      prev.includes(userName) 
        ? prev.filter(u => u !== userName)
        : [...prev, userName]
    );
  };

  // Memoized callbacks for FlatList optimization
  const renderMessage = useCallback(({ item }) => (
    <MessageItem 
      item={item} 
      isGroup={isGroup} 
      currentUserId={currentUserId}
    />
  ), [isGroup, currentUserId]);

  const keyExtractor = useCallback((item) => item.sid, []);

  const renderGroupInfoParticipant = useCallback(({ item }) => {
    const isCurrentUser = item === currentUserId;
    
    return (
      <View style={styles.participantItem}>
        <View style={styles.participantInfo}>
          <View style={styles.participantAvatar}>
            <Text style={styles.participantAvatarText}>
              {item.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.participantName}>
            {item} {isCurrentUser && '(You)'}
          </Text>
        </View>
        {!isCurrentUser && (
          <TouchableOpacity
            onPress={() => removeParticipant(item)}
            style={styles.removeButton}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [currentUserId, removeParticipant]);

  const renderAvailableUser = useCallback(({ item }) => {
    const isSelected = selectedUsers.includes(item.userName);
    
    return (
      <TouchableOpacity
        onPress={() => toggleUserSelection(item.userName)}
        style={styles.availableUserItem}
        activeOpacity={0.7}
      >
        <View style={styles.userInfo}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {item.userName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.availableUserName}>{item.userName}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  }, [selectedUsers, toggleUserSelection]);

  const participantKeyExtractor = useCallback((item) => item, []);
  const userKeyExtractor = useCallback((item) => item.id?.toString() || item.userName, []);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight + insets.top : 0}
        >
          <View style={styles.messagesContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={10}
              initialNumToRender={20}
              updateCellsBatchingPeriod={100}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: false })
              }
              maintainVisibleContentPosition={{
                minIndexForVisible: 0,
                autoscrollToTopThreshold: 10,
              }}
            />
          </View>

          <View style={[styles.inputContainer, { paddingBottom: insets.bottom || 8 }]}>
            <View style={styles.inputWrapperEnhanced}>
              <TouchableOpacity
                style={styles.attachButtonEnhanced}
                onPress={onAttachPress}
                activeOpacity={0.7}
              >
                <Text style={styles.attachIconEnhanced}>+</Text>
              </TouchableOpacity>

              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Message"
                placeholderTextColor="#9CA3AF"
                style={styles.textInputEnhanced}
                multiline
                maxLength={1000}
              />

              <TouchableOpacity
                style={[
                  styles.sendButtonEnhanced,
                  input.trim() ? styles.sendButtonActiveEnhanced : {},
                ]}
                onPress={sendTextMessage}
                disabled={!input.trim() || isTyping}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.sendIconEnhanced,
                    input.trim() ? styles.sendIconActiveEnhanced : {},
                  ]}
                >
                  {isTyping ? '⋯' : '→'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={showGroupInfo}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setShowGroupInfo(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Group Info</Text>
              <View style={{ width: 50 }} />
            </View>

            <ScrollView style={styles.groupInfoContent}>
              <View style={styles.groupInfoSection}>
                <View style={styles.groupHeader}>
                  <View style={styles.groupAvatar}>
                    <Text style={styles.groupAvatarText}>👥</Text>
                  </View>
                  <View style={styles.groupNameContainer}>
                    <Text style={styles.groupInfoName}>{groupInfo.name}</Text>
                    <Text style={styles.groupInfoSubtitle}>
                      {groupInfo.participants.length} participants
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowGroupInfo(false);
                      setShowEditGroupName(true);
                      setShowAddParticipants(false);
                    }}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.groupInfoSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Participants</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowGroupInfo(false);
                      fetchAvailableUsers();
                      setShowAddParticipants(true);
                      setShowEditGroupName(false);
                    }}
                    style={styles.addCircleButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addCircleButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={groupInfo.participants}
                  keyExtractor={participantKeyExtractor}
                  renderItem={renderGroupInfoParticipant}
                  scrollEnabled={false}
                />
              </View>

              <View style={styles.groupInfoSection}>
                <TouchableOpacity
                  onPress={leaveGroup}
                  style={styles.leaveGroupButton}
                >
                  <Text style={styles.leaveGroupText}>Leave Group</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={showAddParticipants}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowAddParticipants(false);
                  setShowGroupInfo(true);
                  setSelectedUsers([]);
                }}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Participants</Text>
              <TouchableOpacity
                onPress={addParticipants}
                style={[styles.modalActionButton, 
                  selectedUsers.length === 0 && styles.modalActionButtonDisabled
                ]}
                disabled={selectedUsers.length === 0 || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={[styles.modalActionText,
                    selectedUsers.length === 0 && styles.modalActionTextDisabled
                  ]}>Add</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.selectedCountText}>
              {selectedUsers.length} selected
            </Text>

            <FlatList
              data={availableUsers}
              keyExtractor={userKeyExtractor}
              renderItem={renderAvailableUser}
              showsVerticalScrollIndicator={false}
              style={styles.userList}
            />
          </SafeAreaView>
        </Modal>

        <Modal
          visible={showEditGroupName}
          animationType="slide"
          presentationStyle="formSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowEditGroupName(false);
                  setShowGroupInfo(true);
                  setNewGroupName(groupInfo.name);
                }}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Group Name</Text>
              <TouchableOpacity
                onPress={updateGroupName}
                style={[styles.modalActionButton, 
                  !newGroupName.trim() && styles.modalActionButtonDisabled
                ]}
                disabled={!newGroupName.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={[styles.modalActionText,
                    !newGroupName.trim() && styles.modalActionTextDisabled
                  ]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.editNameContainer}>
              <TextInput
                style={styles.groupNameInput}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Group name"
                maxLength={50}
                autoFocus
              />
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  messagesContainer: {
    flex: 1,
  },
  headerTitle: {
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    fontSize: 18,
    color: '#007AFF',
  },
  messagesList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },
  messageContainer: {
    flexDirection: 'column',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    marginLeft: 16,
    fontWeight: '500',
  },
  messageBubble: {
    maxWidth: width * 0.72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  ownMessageBubble: {
    backgroundColor: '#111827',
    borderBottomRightRadius: 6,
  },
  otherMessageBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#111827',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 6,
    alignSelf: 'flex-end',
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  ownTimestamp: {
    color: '#9CA3AF',
  },
  otherTimestamp: {
    color: '#6B7280',
  },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 4,
  },
  mediaPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  mediaText: {
    fontSize: 15,
    color: '#6B7280',
    flex: 1,
    fontWeight: '400',
  },
  inputContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  inputWrapperEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  attachButtonEnhanced: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6B7280',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  attachIconEnhanced: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: -2,
  },
  textInputEnhanced: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
    lineHeight: 22,
    minHeight: 36,
    maxHeight: 100,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
    paddingTop: Platform.OS === 'ios' ? 7 : 6,
    paddingBottom: Platform.OS === 'ios' ? 7 : 6,
  },
  sendButtonEnhanced: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    backgroundColor: '#F3F4F6',
  },
  sendButtonActiveEnhanced: {
    backgroundColor: '#111827',
  },
  sendIconEnhanced: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  sendIconActiveEnhanced: {
    color: '#FFFFFF',
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  modalActionButton: {
    padding: 4,
  },
  modalActionButtonDisabled: {
    opacity: 0.4,
  },
  modalActionText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalActionTextDisabled: {
    color: '#9CA3AF',
  },

  // Group Info Styles
  groupInfoContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  groupInfoSection: {
    marginVertical: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  groupAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  groupAvatarText: {
    fontSize: 24,
  },
  groupNameContainer: {
    flex: 1,
  },
  groupInfoName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  groupInfoSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  editButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  addCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCircleButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: -2,
  },

  // Participant Styles
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 8,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  participantName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
  },
  removeButtonText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },

  // Available Users Styles
  selectedCountText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginVertical: 16,
  },
  userList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  availableUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  availableUserName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Edit Group Name Styles
  editNameContainer: {
    padding: 20,
  },
  groupNameInput: {
    fontSize: 16,
    color: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },

  // Leave Group Styles
  leaveGroupButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  leaveGroupText: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '600',
  },
});

export default ChatScreen;