import { useQuery } from '@tanstack/react-query';
import { theatricoClient } from '@/services/api/theatricoClient';
import type { Play } from '@/domain';

export const playKeys = {
  all: ['plays'] as const,
};

export function usePlays() {
  return useQuery<Play[], Error>({
    queryKey: playKeys.all,
    queryFn: () => theatricoClient.listPlays(),
  });
}
