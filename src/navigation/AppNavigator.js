import React, { useState } from 'react';
import AuthStack from './AuthStack';
import MainStack from './MainStack';

export default function AppNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return isLoggedIn ? (
    <MainStack />
  ) : (
    <AuthStack setIsLoggedIn={setIsLoggedIn} />
  );
}
