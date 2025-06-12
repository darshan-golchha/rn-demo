import { useState, useEffect, useRef } from 'react';
import { Dimensions } from 'react-native';

const useOrientation = () => {
  const [screenData, setScreenData] = useState(() => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    return {
      window,
      screen,
      isLandscape: window.width > window.height,
      isPortrait: window.height >= window.width,
    };
  });

  const timeoutRef = useRef(null);

  useEffect(() => {
    const onChange = (result) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Add a small delay to ensure dimensions are properly updated
      // This helps with iOS simulator issues
      timeoutRef.current = setTimeout(() => {
        const { window, screen } = result;
        
        // Double-check dimensions after timeout
        const currentWindow = Dimensions.get('window');
        const currentScreen = Dimensions.get('screen');
        
        const finalWindow = currentWindow.width !== window.width || currentWindow.height !== window.height 
          ? currentWindow 
          : window;
        
        const finalScreen = currentScreen.width !== screen.width || currentScreen.height !== screen.height 
          ? currentScreen 
          : screen;

        setScreenData({
          window: finalWindow,
          screen: finalScreen,
          isLandscape: finalWindow.width > finalWindow.height,
          isPortrait: finalWindow.height >= finalWindow.width,
        });
      }, 100); // 100ms delay to ensure proper dimension update
    };

    // Subscribe to dimension changes
    const subscription = Dimensions.addEventListener('change', onChange);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, []);

  return {
    width: screenData.window.width,
    height: screenData.window.height,
    scale: screenData.window.scale,
    fontScale: screenData.window.fontScale,
    isLandscape: screenData.isLandscape,
    isPortrait: screenData.isPortrait,
    window: screenData.window,
    screen: screenData.screen,
  };
};

export default useOrientation;