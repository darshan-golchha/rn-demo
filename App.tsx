import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import messaging from '@react-native-firebase/messaging';
import { Alert, Linking, Platform } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { initTwilioClient } from './src/engine/twclient';

export async function requestUserPermission() {
  const permission = await messaging().hasPermission();
  if (
    permission === messaging.AuthorizationStatus.AUTHORIZED ||
    permission === messaging.AuthorizationStatus.PROVISIONAL
  ) {
    return true;
  } else {
    Alert.alert(
      'Notifications Disabled',
      'Please enable notifications in settings to receive alerts.',
      [
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
    return false;
  }
}

export async function getFcmToken() {
  const token = await messaging().getToken();
  if (token) {
    return token;
  }
}

// Navigation reference for handling navigation outside component tree
import { navigationRef, navigate, isReadyRef } from './src/navigation/navigationRef';

export default function App() {

  useEffect(() => {
    async function setupNotifications() {
      const permissionGranted = await requestUserPermission();
      if (permissionGranted) {
        console.log('User has notification permissions');
        await getFcmToken();
      }
    }

    setupNotifications();

    async function setupChannel() {
      await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
        importance: AndroidImportance.HIGH,
      });
    }
    setupChannel();
  }, []);

  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('Notification caused app to open from foreground state:', remoteMessage);
      await notifee.displayNotification({
        title: remoteMessage.notification?.title,
        body: remoteMessage.notification?.body,
        android: {
          channelId: 'default',
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
          },
        },
      });
    });

    // Handle tap when app is in background
    const unsubOpen = messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('Notification caused app to open from background state:', remoteMessage);
      if (remoteMessage?.data) {
        navigateToChat(remoteMessage.data);
      }
    });

    return () => {
      unsubscribe();
      unsubOpen();
    };
  }, []);

  interface NotificationData {
  conversationSid: string;
  isGroup?: string | boolean;
  groupName?: string;
  participants?: string;
  recipientUsername?: string;
  recipientAvatar?: string;
}

let initialNotificationData: NotificationData | null = null;

useEffect(() => {
  messaging().getInitialNotification().then(remoteMessage => {
    const data = remoteMessage?.data;
    if (data && typeof data.conversationSid === 'string') {
      // safe to cast now
      initialNotificationData = remoteMessage?.data as any as NotificationData;
    } else {
      console.warn('Initial notification missing conversationSid:', data);
    }
  });

  const interval = setInterval(() => {
    if (initialNotificationData && isReadyRef.current) {
      console.log('Navigating after app ready:', initialNotificationData);
      navigateToChat(initialNotificationData);
      initialNotificationData = null;
      clearInterval(interval);
    }
  }, 500);

  return () => clearInterval(interval);
}, []);



  const navigateToChat = (data: any) => {
    console.log('Navigating to chat with data:', data);
    const isGroup = data.isGroup === 'true' || data.isGroup === true;

    if (!data.conversationSid) return;

    if (isGroup) {
      navigate('Chat', {
        conversationSid: data.conversationSid,
        groupName: data.groupName || '',
        isGroup: true,
        participants: JSON.parse(data.participants || '[]'),
      });
    } else {
      navigate('Chat', {
        conversationSid: data.conversationSid,
        recipientUsername: data.recipientUsername,
        recipientAvatar: data.recipientAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.recipientUsername)}&background=808080&color=fff`,
        isGroup: false,
      });
    }
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        isReadyRef.current = true;
      }}
    >
      <AppNavigator />
    </NavigationContainer>

  );
}
