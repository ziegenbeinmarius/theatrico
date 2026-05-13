import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Annotation } from '@theatrico/shared';
import { createAnnotation, deleteAnnotation, getAnnotations, updateAnnotation } from '../lib/api';

export const annotationKeys = {
  byScript: (scriptId: string) => ['annotations', scriptId] as const,
};

export function useAnnotationsQuery(scriptId: string | undefined) {
  return useQuery({
    queryKey: annotationKeys.byScript(scriptId ?? ''),
    queryFn: () => getAnnotations(scriptId!),
    enabled: Boolean(scriptId),
    staleTime: 30 * 1000,
  });
}

export function useCreateAnnotationMutation(scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineIndex, type, content }: { lineIndex: number; type: string; content: string }) =>
      createAnnotation(scriptId, lineIndex, type, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: annotationKeys.byScript(scriptId) }),
  });
}

export function useUpdateAnnotationMutation(scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, content }: { id: number; type: string; content: string }) =>
      updateAnnotation(id, type, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: annotationKeys.byScript(scriptId) }),
  });
}

export function useDeleteAnnotationMutation(scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAnnotation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: annotationKeys.byScript(scriptId) }),
  });
}

/** Build a map from line_index → list of annotations for fast lookup in the renderer. */
export function buildAnnotationMap(annotations: Annotation[] | undefined): Map<number, Annotation[]> {
  const map = new Map<number, Annotation[]>();
  if (!annotations) return map;
  for (const a of annotations) {
    const existing = map.get(a.line_index);
    if (existing) existing.push(a);
    else map.set(a.line_index, [a]);
  }
  return map;
}
