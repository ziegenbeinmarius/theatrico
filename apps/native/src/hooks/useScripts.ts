import { useMutation, useQueryClient } from '@tanstack/react-query';
import { theatricoClient } from '@/services/api/theatricoClient';
import { playKeys } from './usePlays';
import type { RawPlayDetail } from '@theatrico/shared';

interface NativeUploadClient {
  uploadScript(uri: string, fileName: string, title: string): Promise<RawPlayDetail>;
}

export function useUploadScript() {
  const queryClient = useQueryClient();
  const client = theatricoClient as unknown as NativeUploadClient;
  return useMutation({
    mutationFn: ({ uri, fileName, title }: { uri: string; fileName: string; title: string }) =>
      client.uploadScript(uri, fileName, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playKeys.all }),
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => theatricoClient.deleteScript(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playKeys.all }),
  });
}
