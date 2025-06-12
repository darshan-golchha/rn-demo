import React from 'react'
import { View, Text, Button, StyleSheet } from 'react-native'
import { useSelector, useDispatch } from 'react-redux'
import { increment, decrement, incrementByAmount } from './counterSlice'
import { RFValue } from "react-native-responsive-fontsize";

const CounterScreen = () => {
  const count = useSelector((state) => state.counter.value)
  const dispatch = useDispatch()

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>Counter: {count}</Text>
      <View style={styles.buttonContainer}>
        <Button title="-" onPress={() => dispatch(decrement())} />
        <Button title="+" onPress={() => dispatch(increment())} />
        <Button title="+5" onPress={() => dispatch(incrementByAmount(5))} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    fontSize: RFValue(20),
    marginBottom: 20,
    padding: 10,
    color: 'white',
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 0,
    borderRadius: 10,
  },
})

export default CounterScreen
