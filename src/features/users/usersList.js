import React, { useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { fetchUsers } from './usersSlice';

const UsersList = () => {
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector(state => state.users);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  if (loading) return <ActivityIndicator style={styles.centered} />;
  if (error) return <Text style={styles.centered}>Error: {error}</Text>;

  return (
      <FlatList
        data={data}
        style={{ flex: 1 , backgroundColor: 'white' }}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text>{item.name}</Text>
            <Text>{item.email}</Text>
          </View>
        )}
      />
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 15,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  centered: {
    marginTop: 50,
    textAlign: 'center',
  },
});

export default UsersList;
