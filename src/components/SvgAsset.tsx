import React from 'react';
import { Image, ImageResolvedAssetSource } from 'react-native';
import { SvgUri } from 'react-native-svg';

type SvgAssetProps = {
  source: any;
  width: number;
  height: number;
};

const SvgAsset = ({ source, width, height }: SvgAssetProps) => {
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source) as ImageResolvedAssetSource | undefined;
    const uri = resolved?.uri;
    if (!uri) {
      return null;
    }
    return <SvgUri uri={uri} width={width} height={height} />;
  }

  const Component = source;
  return <Component width={width} height={height} />;
};

export default SvgAsset;
