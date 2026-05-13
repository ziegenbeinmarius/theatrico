import { useQuery } from '@tanstack/react-query';
import { theatricoClient } from '@/services/api/theatricoClient';
import type { Session } from '@/domain';

export const sessionKeys = {
  all: ['sessions'] as const,
  byCode: (code: string) => [...sessionKeys.all, code] as const,
};

export function useSession(code: string) {
  return useQuery<Session, Error>({
    queryKey: sessionKeys.byCode(code),
    queryFn: () => theatricoClient.getSession(code),
    enabled: code.length > 0,
  });
}
