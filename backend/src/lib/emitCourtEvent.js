export function emitCourtEvent(req, event, payload = {}) {
  const io = req.app.get('io');
  if (!io || !req.courtId) {
    console.log('[emitCourtEvent] SKIPPED — io:', !!io, 'courtId:', req.courtId);
    return;
  }
  const room = `court:${req.courtId}`;
  const size = io.sockets.adapter.rooms.get(room)?.size || 0;
  console.log('[emitCourtEvent] emitting', event, 'to', room, '— sockets in room:', size);
  io.to(room).emit(event, payload);
}