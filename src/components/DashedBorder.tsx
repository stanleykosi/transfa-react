import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface DashedBorderProps {
  size: number;
  borderWidth?: number;
  color?: string;
  dashCount?: number;
  gapRatio?: number;
}

export default function DashedBorder({
  size,
  borderWidth = 2,
  color = '#000000',
  dashCount = 12,
  gapRatio = 0.5,
}: DashedBorderProps) {
  const radius = size / 2 - borderWidth / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dashLength = circumference / dashCount;
  const gapLength = dashLength * gapRatio;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={borderWidth}
          fill="none"
          strokeDasharray={`${dashLength - gapLength}, ${gapLength}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
