import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { parseRawScript, flattenLines, type RawPlayDetail } from '@theatrico/shared';
import type { Annotation } from '@theatrico/shared';
import { theatricoClient } from '@/services/api/theatricoClient';
import {
  useAnnotationsQuery,
  useCreateAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
  buildAnnotationMap,
} from '@/hooks/useAnnotations';
import { ScriptView } from '@/components/ScriptView';
import { AnnotationSheet } from '@/components/AnnotationSheet';
import type { FlatLine } from '@theatrico/shared';

const client = theatricoClient as typeof theatricoClient & {
  getScript(id: string): Promise<RawPlayDetail>;
};

function buildLineLabel(flatLines: FlatLine[], seqIdx: number): string {
  const fl = flatLines[seqIdx];
  if (!fl) return `Line ${seqIdx + 1}`;
  const charPart = fl.line.character ? `${fl.line.character} · ` : '';
  const text = fl.line.text;
  return `${charPart}${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
}

interface AnnotationTarget {
  seqIdx: number;
  lineLabel: string;
  annotations: Annotation[];
}

export default function ScriptEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scriptId = id ? decodeURIComponent(id) : '';

  const scriptQuery = useQuery({
    queryKey: ['script-detail', scriptId],
    queryFn: () => client.getScript(scriptId),
    enabled: Boolean(scriptId),
    staleTime: 60 * 1000,
  });

  const annotationsQuery = useAnnotationsQuery(scriptId || undefined);

  const play = useMemo(() => {
    if (!scriptQuery.data?.script) return null;
    return parseRawScript(scriptQuery.data.script);
  }, [scriptQuery.data]);

  const flatLines = useMemo(() => (play ? flattenLines(play) : []), [play]);

  const annotationMap = useMemo(
    () => buildAnnotationMap(annotationsQuery.data),
    [annotationsQuery.data],
  );

  const createAnnotation = useCreateAnnotation(scriptId);
  const updateAnnotation = useUpdateAnnotation(scriptId);
  const deleteAnnotation = useDeleteAnnotation(scriptId);

  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);

  const handleAnnotationPress = useCallback(
    (seqIdx: number, annotations: Annotation[]) => {
      setAnnotationTarget({
        seqIdx,
        lineLabel: buildLineLabel(flatLines, seqIdx),
        annotations,
      });
    },
    [flatLines],
  );

  function handleSave(type: string, content: string) {
    if (!annotationTarget) return;
    const existing = annotationTarget.annotations[0] ?? null;
    if (existing) {
      updateAnnotation.mutate(
        { id: existing.id, type, content },
        { onSuccess: () => setAnnotationTarget(null) },
      );
    } else {
      createAnnotation.mutate(
        { lineIndex: annotationTarget.seqIdx, type, content },
        { onSuccess: () => setAnnotationTarget(null) },
      );
    }
  }

  function handleDelete(id: number) {
    deleteAnnotation.mutate(id, { onSuccess: () => setAnnotationTarget(null) });
  }

  const title = scriptQuery.data?.title ?? 'Script Editor';

  return (
    <>
      <Stack.Screen options={{ title }} />

      {scriptQuery.isLoading ? (
        <View className="flex-1 bg-app-dark items-center justify-center">
          <ActivityIndicator color="#b31e35" size="large" />
          <Text className="text-[13px] text-app-muted mt-3">Loading script…</Text>
        </View>
      ) : scriptQuery.isError || !play ? (
        <View className="flex-1 bg-app-dark items-center justify-center px-8">
          <Text className="text-[13px] text-app-accent text-center">Script not found.</Text>
        </View>
      ) : (
        <View className="flex-1 bg-app-dark">
          <ScriptView
            flatLines={flatLines}
            currentPosition={null}
            annotationMap={annotationMap}
            onAnnotationPress={handleAnnotationPress}
          />
        </View>
      )}

      {annotationTarget && (
        <AnnotationSheet
          visible
          annotation={annotationTarget.annotations[0] ?? null}
          lineLabel={annotationTarget.lineLabel}
          onSave={(type, content) => handleSave(type, content)}
          onDelete={annotationTarget.annotations[0] ? handleDelete : undefined}
          onClose={() => setAnnotationTarget(null)}
          isPending={
            createAnnotation.isPending || updateAnnotation.isPending || deleteAnnotation.isPending
          }
        />
      )}
    </>
  );
}
