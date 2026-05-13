/// <reference types="nativewind/types" />

/* eslint-disable @typescript-eslint/no-unused-vars */

import 'react-native';

declare module 'react-native' {
  interface ScrollViewProps {
    contentContainerClassName?: string;
  }

  interface FlatListProps<ItemT> {
    contentContainerClassName?: string;
  }
}
