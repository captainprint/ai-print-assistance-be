// Office hours used to tell the customer when the team will get back to them
// after a human handoff. Times are shop-local (Toronto / GTA).
// Statutory holidays aren't modelled — on a holiday the bot will say the team
// is in, which is still a soft promise ("as soon as possible").
const OFFICE_TIMEZONE = 'America/Toronto';
const OFFICE_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri (0 = Sunday)
const OFFICE_OPEN_HOUR = 9; // 9:00 AM
const OFFICE_CLOSE_HOUR = 17; // 5:00 PM
const OFFICE_HOURS_TEXT = 'Monday to Friday, 9 AM – 5 PM (Eastern Time)';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Wall-clock parts of `date` in the office timezone.
function localParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: OFFICE_TIMEZONE,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { day, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function formatLocalTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TIMEZONE,
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

// Returns whether the office is open right now and, if not, when it next
// opens, phrased the way a customer would hear it ("first thing tomorrow
// (Tuesday) morning", "first thing Monday morning", "this morning once we
// open at 9 AM").
function getOfficeStatus(now = new Date()) {
  const { day, hour } = localParts(now);
  const isWorkday = OFFICE_DAYS.includes(day);
  const open = isWorkday && hour >= OFFICE_OPEN_HOUR && hour < OFFICE_CLOSE_HOUR;

  let nextOpening = null;
  if (!open) {
    if (isWorkday && hour < OFFICE_OPEN_HOUR) {
      nextOpening = `this morning once we open at ${OFFICE_OPEN_HOUR} AM`;
    } else {
      let offset = 1;
      while (!OFFICE_DAYS.includes((day + offset) % 7)) offset++;
      const nextDay = DAY_NAMES[(day + offset) % 7];
      nextOpening = offset === 1 ? `first thing tomorrow (${nextDay}) morning` : `first thing ${nextDay} morning`;
    }
  }

  return { open, localTime: formatLocalTime(now), nextOpening };
}

module.exports = { getOfficeStatus, OFFICE_HOURS_TEXT, OFFICE_TIMEZONE };
