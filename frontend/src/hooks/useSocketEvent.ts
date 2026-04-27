import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '@/lib/socket';

export function useSocketEvent(event: string, handler: (data?: unknown) => void) {
  const { data: session } = useSession();

  useEffect(() => {
    const socket = getSocket(session?.user?.courtId);
    if (!socket) return;

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [event, handler, session?.user?.courtId]);
}
