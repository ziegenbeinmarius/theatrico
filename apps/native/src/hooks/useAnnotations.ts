import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Annotation } from '@theatrico/shared';
import { theatricoClient } from '@/services/api/theatricoClient';

const client = theatricoClient as typeof theatricoClient & {
  getAnnotations(scriptId: string): Promise<Annotation[]>;
  createAnnotation(scriptId: string, lineIndex: number, type: string, content: string): Promise<Annotation>;
  updateAnnotation(id: number, type: string, content: string): Promise<Annotation>;
  deleteAnnotation(id: number): Promise<void>;
};

export const annotationKeys = {
  byScript: (scriptId: string) => ['annotations', scriptId] as const,
};

export function useAnnotationsQuery(scriptId: string | undefined) {
  return useQuery({
    queryKey: annotationKeys.byScript(scriptId ?? ''),
    queryFn: () => client.getAnnotations(scriptId!),
    enabled: Boolean(scriptId),
    staleTime: 30 * 1000,
  });
}

export function useCreateAnnotation(scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineIndex, type, content }: { lineIndex: number; type: string; content: string }) =>
      client.createAnnotation(scriptId, lineIndex, type, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: annotationKeys.byScript(scriptId) }),
  });
}

export function useUpdateAnnotation(scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, content }: { id: number; type: string; content: string }) =>
      client.updateAnnotation(id, type, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: annotationKeys.byScript(scriptId) }),
  });
}

export function useDeleteAnnotation(scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteAnnotation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: annotationKeys.byScript(scriptId) }),
  });
}

/** Build a map from line_index → list of annotations for fast lookup. */
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
