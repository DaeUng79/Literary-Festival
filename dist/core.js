export function seoulNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, second: parts.second };
}
export const minutes = time => time ? Number(time.split(':')[0]) * 60 + Number(time.split(':')[1]) : null;
export function status(event, now) {
  if (event.date !== now.date) return event.date < now.date ? 'past-day' : 'future-day';
  if (!event.start) return 'untimed';
  const current = minutes(now.time), start = minutes(event.start);
  if (current < start) return start - current <= 30 ? 'soon' : 'upcoming';
  if (event.end) return current < minutes(event.end) ? 'active' : 'ended';
  return current < start + 15 ? 'starting' : 'started';
}
export function activeShifts(item, now) {
  if (item.date !== now.date) return [];
  const current = minutes(now.time);
  return item.shifts.filter(s => current >= minutes(s.start) && current < minutes(s.end));
}
export function currentSchedule(events, now) {
  if (!now?.date || !now?.time) return [];
  const current = minutes(now.time);
  const starts = events
    .filter(event => event.date === now.date && event.start && minutes(event.start) <= current)
    .map(event => minutes(event.start));
  if (!starts.length) return [];
  const latest = Math.max(...starts);
  return events.filter(event => event.date === now.date && event.start && minutes(event.start) === latest);
}
export function selectSchedule(data, date, mode) {
  return data.schedules.filter(e => e.date === date && e.mode === (date.endsWith('-17') ? 'normal' : mode))
    .sort((a, b) => minutes(a.start) - minutes(b.start));
}
