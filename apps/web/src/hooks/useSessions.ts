import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSession, deleteScript, deleteSession, getScript, getScripts, getSession, listSessions, uploadScript } from '../lib/api';

export const sessionKeys = {
  all: ['sessions'] as const,
  detail: (code: string) => [...sessionKeys.all, code.toUpperCase()] as const,
};

export const scriptKeys = {
  all: ['scripts'] as const,
  detail: (id: string) => ['scripts', id] as const,
};

export function useSessionsQuery() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: listSessions,
    refetchInterval: 10_000,
  });
}

export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => deleteSession(code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

export function useSessionQuery(code: string | undefined) {
  return useQuery({
    queryKey: sessionKeys.detail(code ?? ''),
    queryFn: () => getSession(code ?? ''),
    enabled: Boolean(code),
    retry: false,
    staleTime: Infinity, // live updates come via WebSocket; no need to refetch
  });
}

export function useScriptsQuery() {
  return useQuery({
    queryKey: scriptKeys.all,
    queryFn: getScripts,
    staleTime: 60 * 60 * 1000,
  });
}

export function useScriptQuery(id: string | undefined) {
  return useQuery({
    queryKey: scriptKeys.detail(id ?? ''),
    queryFn: () => getScript(id!),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.all }),
  });
}

export function useDeleteScriptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScript(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.all }),
  });
}
