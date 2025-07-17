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
      // const response = await fetch(`https://conv-backend.darshangolchha.com/api/auth/login`, {
      const response = await fetch('http://192.168.29.196:8080/api/auth/login', {
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
    <View style={styles.outerContainer}>
      <View style={styles.chatBubble}>
        <Text style={styles.heading}>Welcome Back 👋</Text>
        <Text style={styles.subHeading}>Sign in to continue chatting</Text>
        <TextInput
          placeholder="Username"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <TextInput
          placeholder="Password"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor="#888"
        />
        <View style={styles.buttonContainer}>
          <Button title="Login" color="#4F8EF7" onPress={handleLogin} />
        </View>
        <Text style={styles.link} onPress={() => navigation.navigate('Register')}>
          Don't have an account? <Text style={{color:'#4F8EF7'}}>Register</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#f2f6fc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatBubble: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    alignItems: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#222',
    textAlign: 'center',
  },
  subHeading: {
    fontSize: 15,
    color: '#666',
    marginBottom: 22,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 0,
    backgroundColor: '#f2f6fc',
    padding: 12,
    marginBottom: 15,
    borderRadius: 15,
    fontSize: 16,
    color: '#222',
  },
  buttonContainer: {
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    marginBottom: 10,
  },
  link: {
    marginTop: 10,
    color: '#888',
    textAlign: 'center',
    fontSize: 15,
  },
});
