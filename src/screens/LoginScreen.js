import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import { saveToken } from '../engine/token';
import { initTwilioClient } from '../engine/twclient';
import Config from "react-native-config";
import messaging from '@react-native-firebase/messaging';

export default function LoginScreen({ navigation, setIsLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const url = Config.API_URL;

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    try {
      const fcm_token = await messaging().getToken();
      const response = await fetch(`http://34.131.11.108/api/auth/login`, {
      // const response = await fetch('http://192.168.29.196:8080/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userName: email,
          passWord: password,
          fcmToken: fcm_token,
        }),
      });
      console.log('Login response:', response); // Add this line for debugging
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }
      const data = await response.json();
      const token = data.token;

      // Store JWT token (e.g., using AsyncStorage or react-native-keychain)
      await saveToken("token", token);
      console.log('Token saved successfully:', token);
      await initTwilioClient();
      console.log('Twilio client initialized successfully');
      setIsLoggedIn(true);
    } catch (error) {
      Alert.alert(`Login Failed`, error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Login</Text>
      <TextInput
        placeholder="Email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="Login" onPress={handleLogin} />
      <Text style={styles.link} onPress={() => navigation.navigate('Register')}>
        Don't have an account? Register
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 15,
    borderRadius: 5,
  },
  link: { marginTop: 15, color: 'blue', textAlign: 'center' },
});
