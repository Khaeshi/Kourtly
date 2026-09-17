import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connectedCourtId: string | null = null;

async function fetchSocketToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/socket-token');
    if(!response.ok) return null;
    const { token } = await response.json();
    return token ?? null;
  } catch (error) {
    return null;
  }
}

export function getSocket(courtId?: string | null): Socket | null {
  if (!courtId) return null;

  if (!socket || connectedCourtId !== courtId) {
    socket?.disconnect();
    socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: async ( cb ) => {
        const token = await fetchSocketToken();
        cb({ token, courtId });
      },
      transports: ['websocket'],
      autoConnect: true,
    });
    connectedCourtId = courtId;
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  connectedCourtId = null;
}
