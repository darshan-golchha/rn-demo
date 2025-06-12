import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import useOrientation from './src/hooks/useOrientation';
import { RFValue } from "react-native-responsive-fontsize";
import Config from 'react-native-config';
import { Provider } from 'react-redux';
import { store } from './src/app/store';
import CounterScreen from './src/features/counter/counterScreen';
import UsersList from './src/features/users/usersList';

const App = () => {
  const { width, height, isLandscape } = useOrientation();
  const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    gap: 10,
  },
  header: {
    flex: 2,
    backgroundColor: 'green',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  headerText: {
    color: 'white',
    fontSize: RFValue(18),
    fontWeight: 'bold',
  },
  body: {
    flex: 6,
    flexDirection: 'row',
    backgroundColor: 'white',
    gap: 10,
    paddingHorizontal: 10,
  },

  sidebar: {
    flex: 3,
    backgroundColor: 'darkblue',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 7,
    flexDirection: isLandscape ? 'column' : 'row',
    backgroundColor: 'darkblue',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flex: 2,
    backgroundColor: 'orange',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
});
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>URL: {Config.API_URL}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.sidebar}>
          <Text style={{ color: 'white', fontSize: RFValue(20), padding: 10 }}>
            {isLandscape ? 'Landscape Mode' : 'Portrait Mode'} - {width} x {height}
          </Text>
        </View>
        <View style={styles.mainContent}>
          <Provider store={store}>
            <CounterScreen />
            <UsersList />
          </Provider>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={{ color: 'white', fontSize: RFValue(17), padding: 10 }}>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </Text>
      </View>
    </View>
  );
};

export default App;