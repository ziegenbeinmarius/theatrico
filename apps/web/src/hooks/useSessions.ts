import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSession, deleteScript, getPlay, getPlays, getSession, uploadScript } from '../lib/api';

export const sessionKeys = {
  all: ['sessions'] as const,
  detail: (code: string) => [...sessionKeys.all, code.toUpperCase()] as const,
};

export const playKeys = {
  all: ['plays'] as const,
  detail: (id: string) => ['plays', id] as const,
};

export function useSessionQuery(code: string | undefined) {
  return useQuery({
    queryKey: sessionKeys.detail(code ?? ''),
    queryFn: () => getSession(code ?? ''),
    enabled: Boolean(code),
    retry: false,
    staleTime: Infinity, // live updates come via WebSocket; no need to refetch
  });
}

export function usePlaysQuery() {
  return useQuery({
    queryKey: playKeys.all,
    queryFn: getPlays,
    staleTime: 60 * 60 * 1000,
  });
}

export function usePlayQuery(id: string | undefined) {
  return useQuery({
    queryKey: playKeys.detail(id ?? ''),
    queryFn: () => getPlay(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

export function useCreateSessionMutation() {
  return useMutation({
    mutationFn: createSession,
  });
}

export function useUploadScriptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title }: { file: File; title: string }) => uploadScript(file, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playKeys.all }),
  });
}

export function useDeleteScriptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScript(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playKeys.all }),
  });
}
