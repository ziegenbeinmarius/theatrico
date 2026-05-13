import { useEffect, useRef } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { TranscriptItem } from '@/hooks/useOperatorSession';

interface Props {
  items: TranscriptItem[];
}

export function TranscriptLog({ items }: Props) {
  const listRef = useRef<FlatList<TranscriptItem>>(null);

  useEffect(() => {
    if (items.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [items.length]);

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-[13px] text-app-subtle italic">Transcript will appear here…</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Text
          className={`text-[15px] leading-[22px] ${item.isFinal ? 'text-app-text' : 'text-app-muted'}`}
        >
          {item.text}
        </Text>
      )}
      className="flex-1"
      contentContainerClassName="p-3 gap-1"
      showsVerticalScrollIndicator={false}
    />
  );
}
