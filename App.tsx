import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import messaging from '@react-native-firebase/messaging';
import { Alert, Linking } from 'react-native';
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
      await notifee.displayNotification({
        title: remoteMessage.notification?.title,
        body: remoteMessage.notification?.body,
        android: {
          channelId: 'default',
          importance: AndroidImportance.HIGH,
        },
      });
    });

    return unsubscribe;
  }, []);

  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}