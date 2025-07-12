import { Client as TwilioChatClient } from '@twilio/conversations';
import { getToken } from './token';


let twilioClient = null;

export const getTwilioClient = () => {
  if (!twilioClient) {
      throw new Error('Twilio client not initialized');
  }
  return twilioClient;
};

export const initTwilioClient = async () => {
  if (twilioClient) return twilioClient;
  const token = await fetchRefreshedTwilioToken();
  if (!token) throw new Error('Failed to fetch Twilio token');

  twilioClient = new TwilioChatClient(token);

  twilioClient.on('tokenAboutToExpire', async () => {
    const refreshedToken = await fetchRefreshedTwilioToken();
    twilioClient.updateToken(refreshedToken);
  });

  return twilioClient;
};
export const fetchRefreshedTwilioToken = async () => {
  const auth_token = await getToken("token");
  const response = await fetch('http://34.131.11.108/api/auth/twilio',
  // const response = await fetch('http://192.168.29.196:8080/api/auth/twilio',
    {
        headers: { 
          Authorization: `Bearer ${auth_token}`,
          'Content-Type': 'application/json',
        },
      });
  if (!response.ok) {
    throw new Error('Failed to fetch Twilio token');
  }
  const data = await response.json();
  console.log("Response from Twilio token endpoint: ",data);
  return data.token;
};