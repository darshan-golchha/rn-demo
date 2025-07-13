import * as Keychain from 'react-native-keychain';

export const saveToken = async (key,token) => {
  try {
    await Keychain.setGenericPassword(key, token, {
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    console.error('Error saving token:', error);
  }
};

export const getToken = async (key) => {
  try {
    const credentials = await Keychain.getGenericPassword();
    if (credentials && credentials.username === key) {
      return credentials.password;
    }
    return null;
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

export const removeToken = async (key) => {
  await Keychain.resetGenericPassword();
};

