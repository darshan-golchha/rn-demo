import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // <-- Add this import
import { getToken } from '../engine/token';
import { getTwilioClient } from '../engine/twclient';

const UserListScreen = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const insets = useSafeAreaInsets(); // <-- Add this line

  const fetchUsers = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const token = await getToken("token");
      const response = await fetch('http://34.131.11.108/api/users/all', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const usersArray = Array.isArray(data) ? data : data.users || [];
      setUsers(usersArray);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.message);
      Alert.alert('Error', 'Failed to load users');
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const client = getTwilioClient();
      if (!client) {
        throw new Error('Twilio client not initialized');
      }

      const subscribedConversations = await client.getSubscribedConversations();
      const conversationsWithDetails = await Promise.all(
        subscribedConversations.items.map(async (conv) => {
          try {
            const participants = await conv.getParticipants();
            const messages = await conv.getMessages(1);
            const lastMessage = messages.items[0];
            // Always use the async method for unread count
            let unreadCount = 0;
            try {
              unreadCount = await conv.getUnreadMessagesCount();
            } catch (e) {
              unreadCount = 0;
            }
            return {
              ...conv,
              unreadCount,
              participants: participants.map(p => p.identity),
              lastMessage: lastMessage ? {
                body: lastMessage.body || (lastMessage.type === 'media' ? '📎 Media' : ''),
                dateCreated: lastMessage.dateCreated,
                author: lastMessage.author
              } : null,
              isGroup: conv.uniqueName.startsWith('group-'),
              displayName: conv.uniqueName.startsWith('group-')
                ? conv.friendlyName
                : participants
                  .filter(p => p.identity !== client.user.identity)
                  .map(p => p.identity)
                  .join(', ')
            };
          } catch (err) {
            console.warn('Error fetching conversation details:', err);
            return {
              ...conv,
              participantCount: 0,
              participants: [],
              lastMessage: null,
              isGroup: false,
              displayName: conv.friendlyName || 'Unknown'
            };
          }
        })
      );

      conversationsWithDetails.sort((a, b) => {
        const aTime = a.lastMessage?.dateCreated || a.dateCreated;
        const bTime = b.lastMessage?.dateCreated || b.dateCreated;
        return new Date(bTime) - new Date(aTime);
      });

      setConversations(conversationsWithDetails);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  }, []);

  const combineLists = useCallback(() => {
    const client = getTwilioClient();
    const currentUser = client?.user?.identity;

    const usersWithConversations = new Set();
    conversations.forEach(conv => {
      if (!conv.isGroup) {
        const otherParticipant = conv.participants.find(p => p !== currentUser);
        if (otherParticipant) {
          usersWithConversations.add(otherParticipant);
        }
      }
    });

    const combined = [];

    conversations.forEach(conv => {
      combined.push({
        type: 'conversation',
        id: conv.sid,
        ...conv
      });
    });

    users.forEach(user => {
      if (!usersWithConversations.has(user.userName) && user.userName !== currentUser) {
        combined.push({
          type: 'user',
          id: user.id || user.userName,
          userName: user.userName,
          email: user.email,
          isOnline: user.isOnline
        });
      }
    });

    combined.sort((a, b) => {
      if (a.type === 'conversation' && b.type === 'user') return -1;
      if (a.type === 'user' && b.type === 'conversation') return 1;

      if (a.type === 'conversation' && b.type === 'conversation') {
        const aTime = a.lastMessage?.dateCreated || a.dateCreated;
        const bTime = b.lastMessage?.dateCreated || b.dateCreated;
        return new Date(bTime) - new Date(aTime);
      }

      if (a.type === 'user' && b.type === 'user') {
        return (a.userName || '').localeCompare(b.userName || '');
      }

      return 0;
    });

    setCombinedData(combined);
  }, [users, conversations]);

  const fetchData = useCallback(async (isRefresh = false) => {
    await Promise.all([
      fetchUsers(isRefresh),
      fetchConversations()
    ]);

    if (!isRefresh) setLoading(false);
    if (isRefresh) setRefreshing(false);
  }, [fetchUsers, fetchConversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    combineLists();
  }, [combineLists]);

  const openOrCreateConversation = async (userName) => {
    try {
      const client = getTwilioClient();
      if (!client) {
        throw new Error('Twilio client not initialized');
      }

      const currentUser = client.user.identity;
      let conversation;

      const existing = await client.getSubscribedConversations();

      for (const conv of existing.items) {
        try {
          if (conv.status !== 'joined') continue;

          const participants = await conv.getParticipants();
          const participantIdentities = participants.map(p => p.identity);

          if (participantIdentities.length === 2) {
            const hasCurrentUser = participantIdentities.includes(currentUser);
            const hasTargetUser = participantIdentities.includes(userName);

            if (hasCurrentUser && hasTargetUser) {
              conversation = conv;
              break;
            }
          }
        } catch (participantError) {
          console.warn('Error checking participants:', participantError);
          continue;
        }
      }

      if (!conversation) {
        conversation = await client.createConversation({
          friendlyName: `${userName}`,
          uniqueName: `chat-${Math.min(currentUser, userName)}-${Math.max(currentUser, userName)}-${Date.now()}`,
        });
        await conversation.add(userName);
        await conversation.add(currentUser);
      }

      navigation.navigate('Chat', {
        conversationSid: conversation.sid,
        recipientUsername: userName,
        recipientAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=808080&color=fff`,
        isGroup: false,
      });
    } catch (err) {
      console.error('Error opening conversation:', err);
      Alert.alert('Error', 'Failed to open chat');
    }
  };

  const openConversation = (conversation) => {
    const client = getTwilioClient();
    const currentUser = client.user.identity;

    if (conversation.isGroup) {
      navigation.navigate('Chat', {
        conversationSid: conversation.sid,
        groupName: conversation.friendlyName,
        isGroup: true,
        participants: conversation.participants,
      });
    } else {
      const otherParticipant = conversation.participants.find(p => p !== currentUser);
      navigation.navigate('Chat', {
        conversationSid: conversation.sid,
        recipientUsername: otherParticipant,
        recipientAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(otherParticipant)}&background=808080&color=fff`,
        isGroup: false,
      });
    }
  };

  const toggleUserSelection = (userName) => {
    setSelectedUsers(prev =>
      prev.includes(userName)
        ? prev.filter(p => p !== userName)
        : [...prev, userName]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Enter a group name');
      return;
    }

    if (selectedUsers.length < 2) {
      Alert.alert('Error', 'Select at least 2 members');
      return;
    }

    setCreatingGroup(true);
    try {
      const client = getTwilioClient();
      if (!client) {
        throw new Error('Twilio client not initialized');
      }

      const conversation = await client.createConversation({
        friendlyName: groupName,
        uniqueName: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });

      for (const userName of selectedUsers) {
        try {
          await conversation.add(userName);
        } catch (err) {
          console.warn(`Error adding user ${userName}:`, err);
        }
      }
      await conversation.add(client.user.identity);

      setShowGroupModal(false);
      setGroupName('');
      setSelectedUsers([]);

      await fetchConversations();

      navigation.navigate('Chat', {
        conversationSid: conversation.sid,
        groupName: groupName,
        isGroup: true,
        participants: [...selectedUsers, client.user.identity],
      });
    } catch (err) {
      console.error('Error creating group:', err);
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const renderItem = ({ item, index }) => {
    if (item.type === 'conversation') {
      return renderConversation({ item, index });
    } else {
      return renderUser({ item, index });
    }
  };

  const renderUser = ({ item, index }) => (
    <TouchableOpacity
      onPress={() => openOrCreateConversation(item.userName)}
      style={[
        styles.itemContainer,
        index === combinedData.length - 1 && styles.lastItem
      ]}
      activeOpacity={0.7}
    >
      <View style={styles.itemContent}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.userName?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.itemDetails}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.userName || 'Unnamed User'}
            </Text>
            <View style={styles.itemMeta}>
              {item.isOnline && <View style={styles.onlineDot} />}
            </View>
          </View>
          <Text style={styles.itemSubtext} numberOfLines={1}>
            {item.email || 'Start a new conversation'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderConversation = ({ item, index }) => {
    const client = getTwilioClient();
    const currentUser = client?.user?.identity;

    return (
      <TouchableOpacity
        onPress={() => openConversation(item)}
        style={[
          styles.itemContainer,
          index === combinedData.length - 1 && styles.lastItem
        ]}
        activeOpacity={0.7}
      >
        <View style={styles.itemContent}>
          <View style={[styles.avatar, item.isGroup && styles.groupAvatar]}>
            <Text style={styles.avatarText}>
              {item.isGroup ? '👥' : item.displayName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.itemDetails}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.displayName}
              </Text>
              <View style={styles.itemMeta}>
                <Text style={styles.timeText}>
                  {formatTime(item.lastMessage?.dateCreated || item.dateCreated)}
                </Text>
              </View>
            </View>
            <View style={styles.messageContainer}>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage ?
                  (item.isGroup && item.lastMessage.author !== currentUser ?
                    `${item.lastMessage.author}: ${item.lastMessage.body}` :
                    item.lastMessage.body
                  ) :
                  'No messages yet'
                }
              </Text>
              {item.unreadCount > 0 && (
                <Text style={styles.unreadBadge}>
                  {item.unreadCount}
                </Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupUserSelection = ({ item }) => {
    const isSelected = selectedUsers.includes(item.userName);

    return (
      <TouchableOpacity
        onPress={() => toggleUserSelection(item.userName)}
        style={styles.groupUserItem}
        activeOpacity={0.7}
      >
        <View style={styles.itemContent}>
          <View style={[styles.avatar, styles.smallAvatar]}>
            <Text style={styles.smallAvatarText}>
              {item.userName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.itemDetails}>
            <Text style={styles.itemName}>{item.userName || 'Unnamed User'}</Text>
            {item.email && (
              <Text style={styles.itemSubtext}>{item.email}</Text>
            )}
          </View>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>No Chats</Text>
      <Text style={styles.emptyStateText}>
        Start a conversation
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorState}>
      <Text style={styles.errorTitle}>Error</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        onPress={() => fetchData()}
        style={styles.retryButton}
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#075E54" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#25D366" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !combinedData.length) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#075E54" />
        {renderError()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="white" barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
      </View>

      <FlatList
        data={combinedData}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#25D366']}
            tintColor="#25D366"
          />
        }
        contentContainerStyle={combinedData.length === 0 ? styles.emptyContainer : null}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: 64 + insets.bottom } // <-- Use safe area inset for bottom
        ]}
        onPress={() => setShowGroupModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>➕</Text>
      </TouchableOpacity>

      <Modal
        visible={showGroupModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowGroupModal(false);
                setGroupName('');
                setSelectedUsers([]);
              }}
              style={styles.modalCancelButton}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Group</Text>
            <TouchableOpacity
              onPress={createGroup}
              style={[styles.modalCreateButton,
                (!groupName.trim() || selectedUsers.length < 2) && styles.modalCreateButtonDisabled
              ]}
              disabled={!groupName.trim() || selectedUsers.length < 2 || creatingGroup}
            >
              {creatingGroup ? (
                <ActivityIndicator size="small" color="#25D366" />
              ) : (
                <Text style={[styles.modalCreateText,
                  (!groupName.trim() || selectedUsers.length < 2) && styles.modalCreateTextDisabled
                ]}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.groupNameContainer}>
            <TextInput
              style={styles.groupNameInput}
              placeholder="Group name"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
            />
            <Text style={styles.selectedCount}>
              {selectedUsers.length} selected
            </Text>
          </View>

          <FlatList
            data={users}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            renderItem={renderGroupUserSelection}
            showsVerticalScrollIndicator={false}
            style={styles.userSelectionList}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingTop: 40,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'black',
  },
  itemContainer: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E8E0',
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // <-- Add this line
  },
  itemDetails: {
    flex: 1, // <-- Add this line
    marginLeft: 12,
    justifyContent: 'center',
    minWidth: 0, // <-- Add this line to allow text truncation
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#8696A0',
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  itemSubtext: {
    fontSize: 14,
    color: '#666',
  },
  participantBadge: {
    fontSize: 11,
    color: '#25D366',
    fontWeight: '600',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#25D366',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#808080',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatar: {
    backgroundColor: '#25D366',
  },
  smallAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  smallAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
  },
  fabIcon: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECE5DD',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#ECE5DD',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF4040',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#25D366',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ECE5DD',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingTop: 40,
    backgroundColor: '#075E54',
    borderBottomWidth: 0,
  },
  modalCancelButton: {
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
  },
  modalCreateButton: {
    paddingVertical: 8,
  },
  modalCreateButtonDisabled: {
    opacity: 0.5,
  },
  modalCreateText: {
    fontSize: 16,
    color: '#25D366',
    fontWeight: '600',
  },
  modalCreateTextDisabled: {
    color: '#8696A0',
  },
  groupNameContainer: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E8E0',
  },
  groupNameInput: {
    fontSize: 16,
    color: '#333',
    padding: 12,
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E8E0',
  },
  selectedCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  userSelectionList: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  groupUserItem: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E8E0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E0E8E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#25D366',
    borderColor: '#25D366',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  unreadBadge: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
    backgroundColor: '#FF4040',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    overflow: 'hidden',
  },
});

export default UserListScreen;