import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Annotation } from '@theatrico/shared';
import type { Play, Position } from '@/domain';
import { findLineIndex, flattenLines } from '@/lib/scriptUtils';
import { AnnotationRow } from '@/components/LineItem';

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
          {currentAnnotations.length > 0 && (
            <View className="mt-2 gap-1">
              {currentAnnotations.map((a) => (
                <AnnotationRow
                  key={a.id}
                  annotation={a}
                  onPress={onAnnotationPress ? () => onAnnotationPress(idx, currentAnnotations) : undefined}
                />
              ))}
            </View>
          )}
          {currentAnnotations.length === 0 && onAnnotationPress && (
            <Pressable
              onPress={() => onAnnotationPress(idx, [])}
              className="self-start mt-1.5 px-2 py-1 rounded-lg bg-app-card border border-[#3d2430]"
            >
              <Text className="text-[11px] text-app-subtle">+ Add annotation</Text>
            </Pressable>
          )}
        </View>

        {/* Upcoming lines */}
        {upcoming.map((fl, i) => {
          const upcomingIdx = idx + 1 + i;
          const upcomingAnnotations = annotationMap?.get(upcomingIdx) ?? [];
          return (
            <View
              key={fl.position.lineId}
              style={[styles.upcomingLine, i === 0 && styles.firstUpcoming]}
            >
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
              {upcomingAnnotations.length > 0 && (
                <View className="mt-1 gap-0.5">
                  {upcomingAnnotations.map((a) => (
                    <AnnotationRow
                      key={a.id}
                      annotation={a}
                      onPress={onAnnotationPress ? () => onAnnotationPress(upcomingIdx, upcomingAnnotations) : undefined}
                    />
                  ))}
                </View>
              )}
            </View>
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
