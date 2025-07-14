import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserListScreen from '../screens/UsersListScreen';
import ChatScreen from '../screens/ChatScreen';

const Stack = createNativeStackNavigator();

export default function MainStack({ setIsLoggedIn }) {
  return (
    <Stack.Navigator initialRouteName="Users">
      <Stack.Screen name="Users" options={{ headerShown: false }}>
        {props => <UserListScreen {...props} setIsLoggedIn={setIsLoggedIn} />}
      </Stack.Screen>
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}
