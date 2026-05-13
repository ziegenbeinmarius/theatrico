import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Play, Position } from '@/domain';
import { findLineIndex, flattenLines } from '@/lib/scriptUtils';

interface Props {
  play: Play | null;
  position: Position | null;
  lookahead?: number;
}

export function ScriptPositionCard({ play, position, lookahead = 6 }: Props) {
  if (!play || !position) {
    return (
      <View className="bg-app-card rounded-xl p-[14px] flex-1 justify-center">
        <Text className="text-[13px] text-app-subtle text-center italic">No position set</Text>
      </View>
    );
  }

  const lines = flattenLines(play);
  const idx = findLineIndex(lines, position.lineId);
  const current = lines[idx];

  if (!current) {
    return (
      <View className="bg-app-card rounded-xl p-[14px] flex-1 justify-center">
        <Text className="text-[13px] text-app-subtle text-center italic">
          Position not found in script
        </Text>
      </View>
    );
  }

  const upcoming = lines.slice(idx + 1, idx + 1 + lookahead);

  return (
    <View className="bg-app-card rounded-xl flex-1 overflow-hidden">
      {/* Breadcrumb */}
      <View style={styles.header}>
        <Text className="text-[11px] text-app-tertiary uppercase tracking-[1px]">
          {current.actTitle} · {current.sceneTitle}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 14, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Current line — highlighted */}
        <View style={styles.currentLine}>
          {current.line.character ? (
            <Text className="text-[11px] text-app-accent font-bold uppercase tracking-[1px] mb-1">
              {current.line.character}
            </Text>
          ) : null}
          <Text className="text-[17px] text-app-text leading-[26px] font-semibold">
            {current.line.text}
          </Text>
        </View>

        {/* Upcoming lines */}
        {upcoming.map((fl, i) => (
          <View key={fl.position.lineId} style={[styles.upcomingLine, i === 0 && styles.firstUpcoming]}>
            {fl.line.character && fl.line.character !== upcoming[i - 1]?.line.character ? (
              <Text className="text-[10px] text-app-muted font-bold uppercase tracking-[0.5px] mb-0.5">
                {fl.line.character}
              </Text>
            ) : null}
            <Text
              className="text-[14px] text-app-subtle leading-[21px]"
              style={{ opacity: 1 - i * 0.12 }}
            >
              {fl.line.text}
            </Text>
          </View>
        ))}

        {upcoming.length === 0 && (
          <Text className="text-xs text-app-subtle italic text-center mt-2">End of script</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a5a',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currentLine: {
    borderLeftWidth: 3,
    borderLeftColor: '#e94560',
    paddingLeft: 12,
  },
  upcomingLine: {
    paddingLeft: 12,
  },
  firstUpcoming: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a5a',
    paddingTop: 12,
  },
});
