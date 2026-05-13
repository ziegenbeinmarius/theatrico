import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Annotation } from '@theatrico/shared';
import type { Play, Position } from '@/domain';
import { findLineIndex, flattenLines } from '@/lib/scriptUtils';

interface Props {
  play: Play | null;
  position: Position | null;
  lookahead?: number;
  annotationMap?: Map<number, Annotation[]>;
  onAnnotationPress?: (seqIdx: number, annotations: Annotation[]) => void;
}

export function ScriptPositionCard({
  play,
  position,
  lookahead = 6,
  annotationMap,
  onAnnotationPress,
}: Props) {
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
  const currentAnnotations = annotationMap?.get(idx) ?? [];
  const hasCue = currentAnnotations.some((a) => a.type === 'cue');

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
        <Pressable
          style={styles.currentLine}
          onPress={
            onAnnotationPress
              ? () => onAnnotationPress(idx, currentAnnotations)
              : undefined
          }
        >
          {current.line.character ? (
            <Text className="text-[11px] text-app-accent font-bold uppercase tracking-[1px] mb-1">
              {current.line.character}
            </Text>
          ) : null}
          <Text className="text-[17px] text-app-text leading-[26px] font-semibold">
            {current.line.text}
          </Text>
          {onAnnotationPress && (
            <View className="flex-row items-center gap-1.5 mt-1.5">
              {currentAnnotations.length > 0 ? (
                <View
                  className={`flex-row items-center gap-1 px-2 py-1 rounded-lg ${
                    hasCue ? 'bg-[#3a2800]' : 'bg-[#1a1030]'
                  }`}
                >
                  <Text className="text-[11px]">{hasCue ? '⚡' : '📝'}</Text>
                  <Text
                    className={`text-[11px] font-semibold ${
                      hasCue ? 'text-[#f5c842]' : 'text-[#9fb4ff]'
                    }`}
                  >
                    {currentAnnotations.length} annotation{currentAnnotations.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : (
                <View className="px-2 py-1 rounded-lg bg-app-card border border-[#3d2430]">
                  <Text className="text-[11px] text-app-subtle">+ Add annotation</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        {/* Upcoming lines */}
        {upcoming.map((fl, i) => {
          const upcomingSeqIdx = idx + 1 + i;
          const upcomingAnnotations = annotationMap?.get(upcomingSeqIdx) ?? [];
          const upcomingHasCue = upcomingAnnotations.some((a) => a.type === 'cue');
          return (
            <Pressable
              key={fl.position.lineId}
              style={[styles.upcomingLine, i === 0 && styles.firstUpcoming]}
              onPress={
                onAnnotationPress
                  ? () => onAnnotationPress(upcomingSeqIdx, upcomingAnnotations)
                  : undefined
              }
            >
              {fl.line.character && fl.line.character !== upcoming[i - 1]?.line.character ? (
                <Text className="text-[10px] text-app-muted font-bold uppercase tracking-[0.5px] mb-0.5">
                  {fl.line.character}
                </Text>
              ) : null}
              <View className="flex-row items-start gap-2">
                <Text
                  className="flex-1 text-[14px] text-app-subtle leading-[21px]"
                  style={{ opacity: 1 - i * 0.12 }}
                >
                  {fl.line.text}
                </Text>
                {upcomingAnnotations.length > 0 && (
                  <View
                    className={`px-1.5 py-0.5 rounded ${
                      upcomingHasCue ? 'bg-[#3a2800]' : 'bg-[#1a1030]'
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-bold ${
                        upcomingHasCue ? 'text-[#f5c842]' : 'text-[#9fb4ff]'
                      }`}
                    >
                      {upcomingHasCue ? '⚡' : '📝'}{upcomingAnnotations.length}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}

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
    borderBottomColor: '#3d2430',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currentLine: {
    borderLeftWidth: 3,
    borderLeftColor: '#b31e35',
    paddingLeft: 12,
  },
  upcomingLine: {
    paddingLeft: 12,
  },
  firstUpcoming: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3d2430',
    paddingTop: 12,
  },
});
