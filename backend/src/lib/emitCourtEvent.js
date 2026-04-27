export function emitCourtEvent(req, event, payload = {}) {
  const io = req.app.get('io');
  if (!io || !req.courtId) return;
  io.to(`court:${req.courtId}`).emit(event, payload);
}
