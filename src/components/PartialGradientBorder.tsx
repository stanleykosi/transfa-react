import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface PartialGradientBorderProps {
  width: number;
  height: number;
  borderRadius?: number;
  color?: string;
  visible?: boolean;
  strokeWidth?: number;
}

export default function PartialGradientBorder({
  width,
  height,
  borderRadius = 20,
  color = '#FFD300',
  visible = false,
  strokeWidth = 1,
}: PartialGradientBorderProps) {
  const gradientId = useMemo(() => `grad-${Math.random().toString(36).slice(2)}`, []);

  if (!visible || width <= 0 || height <= 0) {
    return null;
  }

  const perimeter = 2 * (width + height);
  const segmentLength = perimeter * 0.28;
  const secondOffset = perimeter * 0.45;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="60%" stopColor={color} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <Rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={width - strokeWidth}
          height={height - strokeWidth}
          rx={borderRadius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${segmentLength}, ${perimeter}`}
          strokeLinecap="round"
        />

        <Rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={width - strokeWidth}
          height={height - strokeWidth}
          rx={borderRadius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${segmentLength}, ${perimeter}`}
          strokeDashoffset={-secondOffset}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
