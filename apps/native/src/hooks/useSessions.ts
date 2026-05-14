import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { theatricoClient, type SessionSummary } from '@/services/api/theatricoClient';

export const sessionKeys = {
  all: ['sessions'] as const,
};

export function useSessions() {
  return useQuery<SessionSummary[], Error>({
    queryKey: sessionKeys.all,
    queryFn: () => theatricoClient.listSessions(),
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => theatricoClient.deleteSession(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}
