import { seoulNow, minutes, status, activeShifts, currentSchedule, selectSchedule } from './core.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* A private browser can still use the guide. */ } };
const state = { view: 'now', guide: '17-prepare', mode: read('festival-weather') === 'rain' ? 'rain' : 'normal', previewMode: 'normal', preview: null };
let data;
let lastMinute = '';
const guideItems = [['17-prepare','17일 업무분장'],['17-detail','17일 상세일정'],['18-prepare','18일 업무분장'],['18-detail','18일 상세일정'],['18-rain','18일 우천일정']];
const labels = {active:'진행 중', starting:'시작 알림', soon:'30분 내 시작', upcoming:'예정', cancelled:'취소', ended:'시간 종료', started:'시작 시각 지남', 'past-day':'지난 날짜', 'future-day':'예정', untimed:'시간 확인 필요'};
const now = () => seoulNow();
const dayLabel = date => date === '2026-10-17' ? '10월 17일 (토)' : '10월 18일 (일)';
const nextDate = clock => data.meta.dates.find(d => d >= clock.date) || data.meta.dates.at(-1);
const empty = (title, body = '') => `<div class="empty"><strong>${escape(title)}</strong>${escape(body)}</div>`;
const title = (text, count, sub = '') => `<div class="section-title"><h2>${text}${count === undefined ? '' : `<span class="count">${count}</span>`}</h2><span class="sub">${sub}</span></div>`;
const note = text => text ? `<div class="notes">${escape(text)}</div>` : '';
const location = text => text ? `<div class="location">↳ ${escape(text)}</div>` : '';

function previewControls(clock) {
  const selectedDate = state.preview?.date || clock.date;
  const selectedHour = Number((state.preview?.time || clock.time).slice(0,2));
  const hours = [
    ...data.schedules.flatMap(item => [item.start,item.end]),
    ...data.assignments.flatMap(item => item.shifts.flatMap(shift => [shift.start,shift.end])),
  ].filter(Boolean).map(time => Number(time.slice(0,2)));
  const firstHour = Math.min(...hours), lastHour = Math.max(...hours);
  const hourOptions = Array.from({length:lastHour-firstHour+1},(_,index)=>{
    const hour=firstHour+index, value=`${String(hour).padStart(2,'0')}:00`;
    return `<option value="${value}" ${hour===selectedHour?'selected':''}>${String(hour).padStart(2,'0')}시</option>`;
  }).join('');
  return `<section class="preview-controls preview-tab-controls" aria-label="시간 미리보기 설정">
      <label>날짜<select id="preview-day">${data.meta.dates.map(date => `<option value="${date}" ${date === selectedDate ? 'selected' : ''}>${dayLabel(date)}</option>`).join('')}</select></label>
      <label>시각<select id="preview-time" required style="width:72%">${hourOptions}</select></label>
      <button id="preview-apply" class="primary">미리보기 적용</button>
    </section>`;
}

function eventCard(item, clock, current = false) {
  const phase = item.cancelled ? 'cancelled' : current ? 'active' : status(item, clock);
  return `<article class="card ${phase === 'active' ? 'live' : phase === 'starting' ? 'starting' : ''}">
    <div class="card-head"><span class="time">${escape(item.start)}${item.end ? ` — ${escape(item.end)}` : ' 시작'}</span><span class="badge ${phase}">${labels[phase]}</span></div>
    <div class="card-content">${location(item.location)}<h3>${escape(item.title)}</h3>
    <div class="staff"><span class="staff-label">담당</span>${escape(!item.staff || item.staff === '-' ? '원본 미기재 · 현장 확인' : item.staff)}</div>
    ${note(item.notes)}</div></article>`;
}

function dutyCard(item, clock, currentOnly = false, showCategory = true) {
  const current = activeShifts(item, clock);
  const shifts = currentOnly ? current : item.shifts;
  return `<article class="card">${showCategory ? `<div class="category">${escape(item.category)}</div>` : ''}${location(item.location)}
    <h3>${escape(item.title)}</h3><div class="shift-list">${shifts.map(shift => `<div class="shift ${current.includes(shift) ? 'current' : ''}"><span class="staff-label">${shift.label} ${shift.start}–${shift.end}${current.includes(shift) ? ' · 현재 근무' : ''}</span>${escape(shift.staff || '원본 미기재 · 현장 확인')}</div>`).join('')}</div>
    ${item.detail !== item.title ? note(item.detail.slice(item.title.length).trim()) : ''}${note(item.notes)}</article>`;
}

function currentDutyCategories(duties, clock) {
  const groups = new Map();
  duties.forEach(item => {
    const category = item.category || '기타';
    groups.set(category, [...(groups.get(category) || []), item]);
  });
  return `<div class="duty-category-list">${[...groups].map(([category, items]) => `<details class="duty-category">
    <summary><strong>${escape(category)}</strong><span class="duty-category-count">${items.length}건</span><span class="duty-category-toggle" aria-hidden="true"></span></summary>
    <div class="duty-category-content">${items.map(item => dutyCard(item, clock, true, false)).join('')}</div>
  </details>`).join('')}</div>`;
}

function prepBlock(day) {
  return `<section class="prep-block"><h3>${day === '양일' ? '양일 공통' : `${day}일`} 출근 · 준비 순서</h3><div class="arrival-grid">${data.commute.arrivals.map(item => `<div class="arrival"><span>${item.team}</span><strong>${item.time}</strong><small>까지 중앙도서관 출근</small></div>`).join('')}</div><ol class="steps">${data.commute.preparation.map(text => `<li>${escape(text)}</li>`).join('')}</ol></section>`;
}

function modeControl(date, mode) {
  if (date.endsWith('17')) return '<div class="mode-row mode-row-spacer" aria-hidden="true"></div>';
  const modeLabel = mode === 'rain' ? ' · 우천 운영' : '';
  return `<div class="mode-row"><div class="mode-caption"><strong>${dayLabel(date)}${modeLabel}</strong>내 화면의 일정 선택 · 현장 공지에 따라 전환</div><div class="segmented" role="group" aria-label="18일 일정 종류"><button data-mode="normal" aria-pressed="${mode === 'normal'}" class="${mode === 'normal' ? 'selected' : ''}">일반</button><button data-mode="rain" aria-pressed="${mode === 'rain'}" class="rain ${mode === 'rain' ? 'selected' : ''}">☂ 우천</button></div></div>`;
}

function quickLinks(preEvent = false) {
  const links = preEvent
    ? [['17-prepare','17일 업무분장'],['18-prepare','18일 업무분장'],['commute','출퇴근 안내'],['18-rain','18일 우천일정']]
    : [...guideItems, ['commute','출퇴근 안내']];
  return `${title(preEvent ? '준비할 때 자주 찾는 안내' : '날짜별로 찾아보기')}<div class="quick-grid ${preEvent ? 'quick-grid-priority' : ''}">${links.map(([key, text]) => `<button ${key === 'commute' ? 'data-view="commute"' : `data-guide="${key}"`}><span>${text}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>`;
}

function renderNow(clock, isPreview = false) {
  const date = nextDate(clock);
  const mode = date.endsWith('17') ? 'normal' : isPreview ? state.previewMode : state.mode;
  const events = selectSchedule(data, date, mode);
  const current = currentSchedule(events, clock);
  const upcoming = events.filter(e => !e.cancelled && (e.date > clock.date || e.date === clock.date && minutes(e.start) > minutes(clock.time)));
  const soon = upcoming.filter(e => e.date === clock.date && minutes(e.start) - minutes(clock.time) <= 30);
  const displayNext = soon.length ? soon : upcoming.slice(0, 3);
  const duties = data.assignments.filter(a => a.date === date && a.mode === mode && activeShifts(a, clock).length);
  const currentEvents = current;
  const during = data.meta.dates.includes(clock.date);
  const before = clock.date < data.meta.dates[0];
  let heading = before ? '축제를 준비하고 있어요' : !during ? '양일 일정이 마무리되었습니다' : currentEvents.length ? `현재 상세일정 ${currentEvents.length}건` : duties.length ? `현재 업무분장 ${duties.length}건` : '다음 일정을 확인하세요';
  let description = isPreview ? `${dayLabel(clock.date)} ${clock.time} 기준으로 표시합니다. 실제 현재 업무 화면에는 영향을 주지 않습니다.` : before ? `${dayLabel(data.meta.dates[0])} 첫 일정부터 시간순으로 안내합니다.` : !during ? '지난 업무와 세부 안내는 날짜별 안내에서 확인할 수 있습니다.' : `${dayLabel(clock.date)} ${clock.time} 기준 · 현재 상세일정과 근무 중인 세부분장을 표시합니다.`;
  return `${modeControl(date, mode)}${mode === 'rain' ? '<div class="notice">☂ <strong>우천 일정 보기 중</strong> · 우천 시트의 대체 장소와 업무만 표시합니다. 우천 전환 여부는 현장 공지를 확인하세요. 이 선택은 다른 직원의 화면에 적용되지 않습니다.</div>' : ''}
    <section class="now-summary"><div class="eyebrow"><span class="live-dot"></span>${isPreview ? '미리보기 시각 기준' : '현재 시각 기준'}</div><h2>${heading}</h2><p>${description}</p></section>
    ${during && currentEvents.length ? `${title('현재 상세일정', currentEvents.length)}<div class="grid">${currentEvents.map(e => eventCard(e,clock,true)).join('')}</div>` : ''}
    ${displayNext.length ? `${title(before ? '시간대별 일정' : '다음 일정', displayNext.length, dayLabel(date))}<div class="grid">${displayNext.map(e => eventCard(e, clock)).join('')}</div>` : ''}
    ${before ? quickLinks(true) : ''}
    ${during && minutes(clock.time) < 600 ? `<div style="margin-top:20px">${prepBlock(clock.date.slice(-2))}</div>` : ''}
    ${during && duties.length ? `${title('현재 시간대 업무분장', duties.length, '카테고리를 선택해 확인')} ${currentDutyCategories(duties,clock)}` : ''}
    ${during && !duties.length && !currentEvents.length ? `${title('현재 업무', 0, '현재 배정된 업무가 없습니다')}<div class="grid">${empty('현재 시간에 배정된 업무가 없습니다', displayNext.length ? `다음 일정은 ${displayNext[0].start} · ${displayNext[0].title}` : '날짜별 안내에서 오늘 일정을 확인하세요.')}</div>` : ''}
    ${before ? '' : quickLinks()}`;
}

function renderPreview(realClock) {
  const clock = state.preview ? {...state.preview,second:'00'} : {date:nextDate(realClock),time:'13:00',second:'00'};
  return `<section class="intro"><h2 style="margin-top:10px">시간 미리보기</h2><p>날짜와 시간을 선택해 일정과 업무분장을 확인하세요. 실제 현재 업무 화면에는 영향을 주지 않습니다.</p></section>${previewControls(clock)}${renderNow(clock,true)}`;
}

function renderGuide(clock) {
  const day = state.guide.slice(0, 2), date = `2026-10-${day}`, rain = state.guide.endsWith('rain'), prepare = state.guide.endsWith('prepare');
  const nav = `<nav class="guide-nav" aria-label="날짜별 안내 항목">${guideItems.map(([key,text]) => `<button data-guide="${key}" class="${state.guide === key ? 'selected' : ''}" aria-pressed="${state.guide === key}">${text}</button>`).join('')}</nav>`;
  const mode = rain ? 'rain' : 'normal';
  const assignments = data.assignments.filter(a => a.date === date && a.mode === mode);
  const events = selectSchedule(data, date, mode);
  let content;
  if (prepare) {
    const early = events.filter(e => minutes(e.start) < 600);
    content = `<div class="prep-layout">${prepBlock(day)}<article class="card"><h3>업무 시작 전에 읽어주세요</h3>${data.commute.assignmentNotes.map(t => `<p class="callout">${escape(t)}</p>`).join('')}<p class="source">${escape(data.commute.source)}</p></article></div>
      ${early.length ? `${title('오전 준비 상세일정')}<div class="timeline">${early.map(e=>eventCard(e,clock)).join('')}</div>` : ''}
      ${title('오전 · 오후 업무분장', assignments.length)}<p class="mode-caption">종일 공통 배치는 10–17시로 표시합니다. 행사별 실제 시각은 상세일정과 함께 확인하세요.</p><div class="grid">${assignments.map(a=>dutyCard(a,clock)).join('') || empty('표시할 업무분장이 없습니다')}</div>`;
  } else {
    content = `${rain ? '<div class="notice">☂ 우천 시 대체 장소를 먼저 확인하세요. 아래 시간표는 우천 시트에 기재된 일정만 반영했습니다. 시간이나 담당자가 없는 항목은 아래 전체 분장에서 확인하세요.</div>' : '<p class="mode-caption">종료 시각 미기재 업무는 완료 여부를 판단하지 않습니다. 원본의 시작 시각만 안내합니다.</p>'}
    ${title(rain ? '우천 상세일정' : '시간순 상세일정', events.length)}<div class="timeline">${events.map(e => eventCard(e,clock)).join('') || empty('표시할 일정이 없습니다')}</div>
      ${rain ? `${title('우천 장소 · 전체 업무분장', assignments.length)}<div class="grid">${assignments.map(a=>dutyCard(a,clock)).join('')}</div>` : ''}`;
  }
  return `${nav}<section class="intro"><div class="eyebrow">${rain ? '우천 시 대체 운영' : '현장 운영 안내'}</div><h2 style="margin-top:10px">${dayLabel(date)} ${prepare ? '업무분장' : rain ? '우천일정' : '상세일정'}</h2><p>${prepare ? '출근부터 물품 준비, 오전·오후 담당 업무까지.' : rain ? '장소가 달라져도, 업무를 놓치지 않도록.' : '시간에 맞춰 업무와 담당자를 확인하세요.'}</p></section>${content}`;
}

function renderCommute() {
  const mealPlace = data.commute.mealPlace;
  return `<section class="intro"><h2 style="margin-top:10px">출근부터 퇴근 확인까지</h2><p>10월 17일(토) · 18일(일) / 출근 장소: 중앙도서관</p></section><div class="commute-grid">${prepBlock('양일')}<div><article class="card"><div class="category">초과근무 · 차출경비 · 대체휴무 관련</div><h3>초과사전 및 인사랑 확인</h3><p class="body-copy">${escape(data.commute.attendance)}</p><p class="source">${escape(data.commute.source)}</p></article><article class="card"><h3>업무분장, 세부내용 필독</h3>${data.commute.assignmentNotes.map(t=>`<p class="callout">${escape(t)}</p>`).join('')}</article></div></div><div class="notice" style="margin-top:20px"><strong>추가 확인사항</strong><br>${escape(data.commute.unconfirmed)}</div><div class="notice" style="margin-top:12px"><strong>회식 장소</strong><br><a href="${escape(mealPlace.url)}" target="_blank" rel="noopener noreferrer">${escape(mealPlace.name)}</a> (${escape(mealPlace.location)})</div>`;
}

function renderClock() {
  const clock = now();
  $('#clock').innerHTML = `${clock.time}<span>:${clock.second}</span>`;
  $('#clock-date').textContent = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(`${clock.date}T12:00:00+09:00`));
  $('#clock-label').textContent = '한국 표준시 · 자동 갱신';
  return clock;
}

function render() {
  if (!data) return;
  const clock = renderClock();
  lastMinute = `${clock.date} ${clock.time}`;
  $('#page-title').textContent = state.view === 'now' ? '지금, 현장에서' : state.view === 'guide' ? '함께, 차근차근' : state.view === 'preview' ? '시간 미리보기' : '출근도, 준비도';
  document.querySelectorAll('.main-nav button').forEach(button => {
    button.classList.toggle('selected', button.dataset.view === state.view);
    if (button.dataset.view === state.view) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  const openDetails = [...$('#content').querySelectorAll('details')].map((el,index)=>el.open ? index : -1).filter(index=>index>=0);
  const previousFocus = document.activeElement;
  const focusKey = previousFocus?.dataset?.guide || previousFocus?.dataset?.mode;
  $('#content').innerHTML = state.view === 'now' ? renderNow(clock) : state.view === 'guide' ? renderGuide(clock) : state.view === 'preview' ? renderPreview(clock) : renderCommute();
  // Preserve disclosure state through automatic minute refreshes.
  $('#content').querySelectorAll('details').forEach((el,index)=>{el.open=openDetails.includes(index);});
  if (focusKey) [...$('#content').querySelectorAll('button')].find(b=>b.dataset.guide===focusKey || b.dataset.mode===focusKey)?.focus({preventScroll:true});
}

function navigate(view, guide) {
  state.view = view;
  if (guide) state.guide = guide;
  render();
  window.scrollTo({top:0,behavior:'instant'});
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'preview-apply') {
    if (!$('#preview-time').reportValidity()) return;
    state.preview={date:$('#preview-day').value,time:$('#preview-time').value};
    render();return;
  }
  if (button.dataset.view) navigate(button.dataset.view);
  if (button.dataset.guide) navigate('guide',button.dataset.guide);
  if (button.dataset.mode) {
    if (state.view === 'preview') state.previewMode=button.dataset.mode;
    else { state.mode=button.dataset.mode;save('festival-weather',state.mode); }
    render();
  }
});
$('#reload').addEventListener('click',()=>loadData());
function connectivity(){
  $('#connection').hidden=navigator.onLine;
  $('#connection').textContent='인터넷 연결이 끊겼습니다. 이미 불러온 일정은 계속 볼 수 있지만, 최신 변경사항은 연결 후 새로고침해주세요.';
}
window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
setInterval(()=>{if(!data)return;const clock=renderClock();if(`${clock.date} ${clock.time}`!==lastMinute)render();},1000);

async function loadData() {
  $('#reload').disabled=true;
  $('#reload').textContent='자료 확인 중…';
  try {
    const response=await fetch('./data.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const fresh=await response.json();
    if(!fresh.meta?.dates || !Array.isArray(fresh.assignments) || !Array.isArray(fresh.schedules) || !fresh.commute)throw new Error('일정 형식 오류');
    data=fresh;
    $('#updated-at').textContent=data.meta.updatedAt.replace(/-/g,'.');
    $('#source-notes').innerHTML=`<p>자료: ${escape(data.meta.sourceFile)} 및 담당자 제공 출퇴근 안내.</p><p>${escape(data.meta.dateNote)}</p><ul>${data.meta.notices.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><p>화면의 시각은 기기의 시계를 한국 시간으로 변환합니다. 자동 날짜·시간 설정을 사용해주세요. 우천 선택은 이 브라우저에만 저장됩니다. 일정 변경은 자료 새로고침으로 반영합니다.</p>`;
    render();connectivity();
    $('#reload').textContent='최신 자료 확인 완료';
  } catch(error) {
    if(!data)$('#content').innerHTML=empty('일정을 불러오지 못했습니다','인터넷 연결을 확인한 뒤 아래 최신 자료 새로고침을 눌러주세요.');
    $('#connection').hidden=false;
    $('#connection').textContent=`최신 자료를 불러오지 못했습니다.${data ? ' 기존에 불러온 자료를 표시합니다.' : ''} (${error.message})`;
    $('#reload').textContent='자료 다시 불러오기';
  } finally {$('#reload').disabled=false;}
}
loadData();
