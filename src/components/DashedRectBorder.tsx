import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

interface DashedRectBorderProps {
  width: number;
  height: number;
  borderRadius?: number;
  borderWidth?: number;
  color?: string;
  dashCount?: number;
  gapRatio?: number;
}

export default function DashedRectBorder({
  width,
  height,
  borderRadius = 0,
  borderWidth = 2,
  color = '#000000',
  dashCount = 20,
  gapRatio = 0.5,
}: DashedRectBorderProps) {
  const perimeter = 2 * (width + height) - 8 * borderRadius;
  const dashLength = perimeter / dashCount;
  const gapLength = dashLength * gapRatio;
  const adjustedDashLength = dashLength - gapLength;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Rect
          x={borderWidth / 2}
          y={borderWidth / 2}
          width={width - borderWidth}
          height={height - borderWidth}
          rx={borderRadius}
          ry={borderRadius}
          stroke={color}
          strokeWidth={borderWidth}
          fill="none"
          strokeDasharray={`${adjustedDashLength}, ${gapLength}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
