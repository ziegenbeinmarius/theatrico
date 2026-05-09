import { useMutation, useQuery } from '@tanstack/react-query';
import { createSession, getScript, getSession } from '../lib/api';

export const scriptKeys = {
  all: ['script'] as const,
};

export const sessionKeys = {
  all: ['sessions'] as const,
  detail: (code: string) => [...sessionKeys.all, code.toUpperCase()] as const,
};

export function useScriptQuery() {
  return useQuery({
    queryKey: scriptKeys.all,
    queryFn: getScript,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSessionQuery(code: string | undefined) {
  return useQuery({
    queryKey: sessionKeys.detail(code ?? ''),
    queryFn: () => getSession(code ?? ''),
    enabled: Boolean(code),
    retry: false,
  });
}

export function useCreateSessionMutation() {
  return useMutation({
    mutationFn: createSession,
  });
}
