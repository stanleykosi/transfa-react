import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

const logoSvg = `<svg width="175" height="69" viewBox="0 0 175 69" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_201_147)">
<path d="M0.687981 39.1386L138.352 39.0393L174.311 0.988525L0.687981 39.1386Z" fill="black"/>
<path d="M81.387 68.5497L102.907 43.0521H72.0934L81.387 68.5497Z" fill="black"/>
</g>
<defs>
<clipPath id="clip0_201_147">
<rect width="173.623" height="67.5614" fill="white" transform="translate(0.688332 0.988525)"/>
</clipPath>
</defs>
</svg>`;

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, onFinish]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <SvgXml xml={logoSvg} width={175} height={69} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD300',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
