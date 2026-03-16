/**
 * emails/confirmationEmail.js
 *
 * Pure function — takes reservation data, returns { to, subject, html }.
 * No side effects, no imports, fully testable in isolation.
 */

function toMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
  
  function fmtMins(totalMins) {
    const h       = Math.floor(totalMins / 60);
    const m       = totalMins % 60;
    const ampm    = h >= 12 ? 'PM' : 'AM';
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${display}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  
  function fmtTimeRange(timeSlot, durationHours) {
    const startMins = toMinutes(timeSlot.split('-')[0]);
    const endMins   = startMins + durationHours * 60;
    return `${fmtMins(startMins)} – ${fmtMins(endMins)}`;
  }
  
  function fmtDateLong(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
  
  /**
   * @param {object} reservation - Mongoose document or plain object
   * @returns {{ to: string, subject: string, html: string }}
   */
  export function buildConfirmationEmail(reservation) {
    const { name, court, date, timeSlot, duration, playerCount, phone, email, notes } = reservation;
  
    const timeRange     = fmtTimeRange(timeSlot, duration);
    const formattedDate = fmtDateLong(date);
  
    return {
      to:      email,
      subject: `Booking Confirmed – Court ${court} · ${formattedDate}`,
      html:    confirmationHtml({ name, court, formattedDate, timeRange, duration, playerCount, phone, notes }),
    };
  }
  
  // ── HTML template ─────────────────────────────────────────────────────────────
  // Kept as a separate named function so it's easy to preview / unit test
  // without constructing a full reservation object.
  
  export function confirmationHtml({ name, court, formattedDate, timeRange, duration, playerCount, phone, notes }) {
    return /* html */`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmed</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  
          <!-- ── Header ── -->
          <tr><td style="
            background:#0a1f0a;
            border-radius:12px 12px 0 0;
            padding:36px 40px 28px;
          ">
            <p style="margin:0 0 16px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(200,245,106,0.5);">
              South City Badminton Court
            </p>
            <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#ffffff;line-height:1.2;">
              Booking Confirmed ✓
            </h1>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.45);">
              Hi ${name}, your court is reserved.
            </p>
          </td></tr>
  
          <!-- ── Details card ── -->
          <tr><td style="background:#ffffff;padding:32px 40px;">
  
            <table width="100%" cellpadding="0" cellspacing="0" style="
              background:#f9f9f7;
              border:1px solid #ebebeb;
              border-radius:8px;
              overflow:hidden;
            ">
              ${detailRow('Court',    `Court ${court}`)}
              ${detailRow('Date',     formattedDate)}
              ${detailRow('Time',     timeRange, `${duration} hour${duration > 1 ? 's' : ''}`)}
              ${detailRow('Players',  `${playerCount} pax`, null, true)}
            </table>
  
            ${notes ? notesBlock(notes) : ''}
  
            <p style="margin:28px 0 0;font-size:13px;color:#888;line-height:1.6;">
              Questions? Contact us — <strong>${phone}</strong> — or reply to this email.
            </p>
          </td></tr>
  
          <!-- ── Footer ── -->
          <tr><td style="
            background:#f0f0eb;
            border-radius:0 0 12px 12px;
            padding:20px 40px;
          ">
            <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">
              South City Badminton Court · See you on the court!
            </p>
          </td></tr>
  
        </table>
      </td></tr>
    </table>
  
  </body>
  </html>`;
  }
  
  // ── Sub-templates ─────────────────────────────────────────────────────────────
  
  function detailRow(label, value, subtext = null, isLast = false) {
    return `
      <tr><td style="padding:20px 24px;${isLast ? '' : 'border-bottom:1px solid #ebebeb;'}">
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#aaa;">${label}</p>
        <p style="margin:0;font-size:16px;font-weight:600;color:#1a1a1a;">${value}</p>
        ${subtext ? `<p style="margin:4px 0 0;font-size:12px;color:#999;">${subtext}</p>` : ''}
      </td></tr>`;
  }
  
  function notesBlock(notes) {
    return `
      <div style="margin-top:20px;padding:16px 20px;background:#fffdf0;border:1px solid #f0e8c0;border-radius:8px;">
        <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b8a050;">Notes</p>
        <p style="margin:0;font-size:13px;color:#6b5e30;">${notes}</p>
      </div>`;
  }