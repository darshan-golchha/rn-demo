import React, { useState, useEffect } from 'react';
import AuthStack from './AuthStack';
import MainStack from './MainStack';
import { getToken } from '../engine/token';
import { initTwilioClient } from '../engine/twclient';

export default function AppNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getToken("token");
        if (token) {
          await initTwilioClient();
          setIsLoggedIn(true);
        }
      } catch (e) {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  if (loading) return null; // Or a loading spinner

  return isLoggedIn ? (
    <MainStack />
  ) : (
    <AuthStack setIsLoggedIn={setIsLoggedIn} />
  );
}
