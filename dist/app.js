import { seoulNow, minutes, status, activeShifts, matches, selectSchedule } from './core.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* A private browser can still use the guide. */ } };
const state = { view: 'now', guide: '17-prepare', mode: read('festival-weather') === 'rain' ? 'rain' : 'normal', query: '', preview: null };
let data;
let lastMinute = '';
const guideItems = [['17-prepare','17일 업무분장'],['17-detail','17일 상세일정'],['18-prepare','18일 업무분장'],['18-detail','18일 상세일정'],['18-rain','18일 우천일정']];
const labels = {active:'진행 중', starting:'시작 알림', soon:'30분 내 시작', upcoming:'예정', ended:'시간 종료', started:'시작 시각 지남', 'past-day':'지난 날짜', 'future-day':'예정', untimed:'시간 확인 필요'};
const now = () => state.preview ? {...state.preview, second:'00'} : seoulNow();
const dayLabel = date => date === '2026-10-17' ? '10월 17일 (토)' : '10월 18일 (일)';
const nextDate = clock => data.meta.dates.find(d => d >= clock.date) || data.meta.dates.at(-1);
const daysUntilStart = clock => Math.max(0, Math.round((Date.parse(`${data.meta.dates[0]}T00:00:00Z`) - Date.parse(`${clock.date}T00:00:00Z`)) / 86400000));
const empty = (title, body = '') => `<div class="empty"><strong>${escape(title)}</strong>${escape(body)}</div>`;
const title = (text, count, sub = '') => `<div class="section-title"><h2>${text}${count === undefined ? '' : `<span class="count">${count}</span>`}</h2><span class="sub">${sub}</span></div>`;
const note = text => text ? `<div class="notes">${escape(text)}</div>` : '';
const location = text => text ? `<div class="location">↳ ${escape(text)}</div>` : '';

function eventCard(item, clock) {
  const phase = status(item, clock);
  return `<article class="card ${phase === 'active' ? 'live' : phase === 'starting' ? 'starting' : ''}">
    <div class="card-head"><span class="time">${escape(item.start)}${item.end ? ` — ${escape(item.end)}` : ' 시작'}</span><span class="badge ${phase}">${labels[phase]}</span></div>
    <div class="card-content">${location(item.location)}<h3>${escape(item.title)}</h3>
    <div class="staff"><span class="staff-label">담당</span>${escape(!item.staff || item.staff === '-' ? '원본 미기재 · 현장 확인' : item.staff)}</div>
    ${note(item.notes)}${!item.end ? '<div class="point-note">종료 시각 미기재 · 시작 알림은 15분간 표시</div>' : ''}</div></article>`;
}

function dutyCard(item, clock, currentOnly = false) {
  const current = activeShifts(item, clock);
  const shifts = currentOnly ? current : item.shifts;
  return `<article class="card"><div class="category">${escape(item.category)}</div>${location(item.location)}
    <h3>${escape(item.title)}</h3><div class="shift-list">${shifts.map(shift => `<div class="shift ${current.includes(shift) ? 'current' : ''}"><span class="staff-label">${shift.label} ${shift.start}–${shift.end}${current.includes(shift) ? ' · 현재 근무' : ''}</span>${escape(shift.staff || '원본 미기재 · 현장 확인')}</div>`).join('')}</div>
    ${item.detail !== item.title ? note(item.detail.slice(item.title.length).trim()) : ''}${note(item.notes)}</article>`;
}

function prepBlock(day) {
  return `<section class="prep-block"><h3>${day === '양일' ? '양일 공통' : `${day}일`} 출근 · 준비 순서</h3><div class="arrival-grid">${data.commute.arrivals.map(item => `<div class="arrival"><span>${item.team}</span><strong>${item.time}</strong><small>까지 중앙도서관 출근</small></div>`).join('')}</div><ol class="steps">${data.commute.preparation.map(text => `<li>${escape(text)}</li>`).join('')}</ol></section>`;
}

function modeControl(date) {
  return `<div class="mode-row"><div class="mode-caption"><strong>${dayLabel(date)} · ${state.mode === 'rain' && date.endsWith('18') ? '우천 운영' : '일반 운영'}</strong>${date.endsWith('18') ? '내 화면의 일정 선택 · 현장 공지에 따라 전환' : '17일은 일반 일정만 제공됩니다'}</div>${date.endsWith('18') ? `<div class="segmented" role="group" aria-label="18일 일정 종류"><button data-mode="normal" aria-pressed="${state.mode === 'normal'}" class="${state.mode === 'normal' ? 'selected' : ''}">일반</button><button data-mode="rain" aria-pressed="${state.mode === 'rain'}" class="rain ${state.mode === 'rain' ? 'selected' : ''}">☂ 우천</button></div>` : ''}</div>`;
}

function quickLinks(preEvent = false) {
  const links = preEvent
    ? [['17-prepare','17일 업무분장'],['18-prepare','18일 업무분장'],['commute','출퇴근 안내'],['18-rain','18일 우천일정']]
    : [...guideItems, ['commute','출퇴근 안내']];
  return `${title(preEvent ? '준비할 때 자주 찾는 안내' : '날짜별로 찾아보기')}<div class="quick-grid ${preEvent ? 'quick-grid-priority' : ''}">${links.map(([key, text]) => `<button ${key === 'commute' ? 'data-view="commute"' : `data-guide="${key}"`}><span>${text}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>`;
}

function renderNow(clock) {
  const date = nextDate(clock);
  const mode = date.endsWith('17') ? 'normal' : state.mode;
  const events = selectSchedule(data, date, mode, state.query);
  const live = events.filter(e => ['active','starting'].includes(status(e, clock)));
  const upcoming = events.filter(e => e.date > clock.date || e.date === clock.date && minutes(e.start) > minutes(clock.time));
  const soon = upcoming.filter(e => e.date === clock.date && minutes(e.start) - minutes(clock.time) <= 30);
  const displayNext = soon.length ? soon : upcoming.slice(0, 3);
  const duties = data.assignments.filter(a => a.date === date && a.mode === mode && activeShifts(a, clock).length && matches({...a, shifts:activeShifts(a, clock)}, state.query));
  const during = data.meta.dates.includes(clock.date);
  const before = clock.date < data.meta.dates[0];
  let heading = before ? '축제를 준비하고 있어요' : !during ? '양일 일정이 마무리되었습니다' : duties.length ? `현재 업무분장 ${duties.length}건` : live.length ? `지금 확인할 상세일정 ${live.length}건` : '다음 일정을 확인하세요';
  let description = before ? `${dayLabel(data.meta.dates[0])} 행사까지 D-${daysUntilStart(clock)}입니다. 업무분장과 출퇴근 안내를 미리 확인하세요.` : !during ? '지난 업무와 세부 안내는 날짜별 안내에서 확인할 수 있습니다.' : `${dayLabel(clock.date)} ${clock.time} 기준 · 세부분장 업무와 다음 상세일정을 표시합니다.`;
  return `${modeControl(date)}${mode === 'rain' ? '<div class="notice">☂ <strong>우천 일정 보기 중</strong> · 우천 시트의 대체 장소와 업무만 표시합니다. 우천 전환 여부는 현장 공지를 확인하세요. 이 선택은 다른 직원의 화면에 적용되지 않습니다.</div>' : ''}
    <section class="now-summary"><div class="eyebrow"><span class="live-dot"></span>${state.preview ? '시간 미리보기' : '현재 시각 기준'}</div><h2>${heading}</h2><p>${description}</p></section>
    ${before ? quickLinks(true) : ''}
    ${during && minutes(clock.time) < 600 ? `<div style="margin-top:20px">${prepBlock(clock.date.slice(-2))}</div>` : ''}
    ${during && duties.length ? `${title('현재 업무분장', duties.length, '세부분장 기준 · 현재 근무 시간')}<div class="grid">${duties.map(e => dutyCard(e,clock,true)).join('')}</div>` : ''}
    ${during && live.length ? `${title('현재 상세일정', live.length, '진행 중 · 시작 알림')}<div class="grid">${live.map(e => eventCard(e,clock)).join('')}</div>` : ''}
    ${during && !duties.length && !live.length ? `${title('현재 업무', 0, '다음 상세일정까지')}<div class="grid">${empty(state.query ? '검색한 업무가 현재 시간에 없습니다' : '현재 시간에 배정된 업무가 없습니다', displayNext.length ? `다음 일정은 ${displayNext[0].start} · ${displayNext[0].title}` : '날짜별 안내에서 오늘 일정을 확인하세요.')}</div>` : ''}
    ${displayNext.length ? `${title(before ? '행사 첫 일정' : soon.length ? '곧 시작해요' : '다음 일정', displayNext.length, dayLabel(date))}<div class="grid">${displayNext.map(e => eventCard(e, clock)).join('')}</div>` : ''}
    ${before ? '' : quickLinks()}`;
}

function renderGuide(clock) {
  const day = state.guide.slice(0, 2), date = `2026-10-${day}`, rain = state.guide.endsWith('rain'), prepare = state.guide.endsWith('prepare');
  const nav = `<nav class="guide-nav" aria-label="날짜별 안내 항목">${guideItems.map(([key,text]) => `<button data-guide="${key}" class="${state.guide === key ? 'selected' : ''}" aria-pressed="${state.guide === key}">${text}</button>`).join('')}</nav>`;
  const mode = rain ? 'rain' : 'normal';
  const assignments = data.assignments.filter(a => a.date === date && a.mode === mode && matches(a, state.query));
  const events = selectSchedule(data, date, mode, state.query);
  let content;
  if (prepare) {
    const early = events.filter(e => minutes(e.start) < 600);
    content = `${state.query ? '' : `<div class="prep-layout">${prepBlock(day)}<article class="card"><h3>업무 시작 전에 읽어주세요</h3>${data.commute.assignmentNotes.map(t => `<p class="callout">${escape(t)}</p>`).join('')}<p class="source">${escape(data.commute.source)}</p></article></div>`}
      ${early.length ? `${title('오전 준비 상세일정')}<div class="timeline">${early.map(e=>eventCard(e,clock)).join('')}</div>` : ''}
      ${title('오전 · 오후 업무분장', assignments.length)}<p class="mode-caption">종일 공통 배치는 10–17시로 표시합니다. 행사별 실제 시각은 상세일정과 함께 확인하세요.</p><div class="grid">${assignments.map(a=>dutyCard(a,clock)).join('') || empty('검색 결과가 없습니다', '이름 또는 업무명을 다시 확인해주세요.')}</div>`;
  } else {
    content = `${rain ? '<div class="notice">☂ 우천 시 대체 장소를 먼저 확인하세요. 아래 시간표는 우천 시트에 기재된 일정만 반영했습니다. 시간이나 담당자가 없는 항목은 아래 전체 분장에서 확인하세요.</div>' : '<p class="mode-caption">종료 시각 미기재 업무는 완료 여부를 판단하지 않습니다. 원본의 시작 시각만 안내합니다.</p>'}
      ${title(rain ? '우천 상세일정' : '시간순 상세일정', events.length)}<div class="timeline">${events.map(e => eventCard(e,clock)).join('') || empty('검색 결과가 없습니다','다른 이름이나 업무명으로 검색해주세요.')}</div>
      ${rain ? `${title('우천 장소 · 전체 업무분장', assignments.length)}<div class="grid">${assignments.map(a=>dutyCard(a,clock)).join('')}</div>` : ''}`;
  }
  return `${nav}<section class="intro"><div class="eyebrow">${rain ? '우천 시 대체 운영' : '현장 운영 안내'}</div><h2 style="margin-top:10px">${dayLabel(date)} ${prepare ? '업무분장' : rain ? '우천일정' : '상세일정'}</h2><p>${prepare ? '출근부터 물품 준비, 오전·오후 담당 업무까지.' : rain ? '장소가 달라져도, 업무를 놓치지 않도록.' : '시간에 맞춰 업무와 담당자를 확인하세요.'}</p></section>${content}`;
}

function renderCommute() {
  return `<section class="intro"><div class="eyebrow">양일 공통 안내</div><h2 style="margin-top:10px">출근부터 퇴근 확인까지</h2><p>10월 17일(토) · 18일(일) / 출근 장소: 중앙도서관</p></section><div class="commute-grid">${prepBlock('양일')}<div><article class="card"><div class="category">초과근무 · 차출경비 · 대체휴무 관련</div><h3>초과사전 및 인사랑 확인</h3><p class="body-copy">${escape(data.commute.attendance)}</p><p class="source">${escape(data.commute.source)}</p></article><article class="card"><h3>업무분장, 세부내용 필독</h3>${data.commute.assignmentNotes.map(t=>`<p class="callout">${escape(t)}</p>`).join('')}</article></div></div><div class="notice" style="margin-top:20px"><strong>추가 확인사항</strong><br>${escape(data.commute.unconfirmed)}</div>`;
}

function renderClock() {
  const clock = now();
  $('#clock').innerHTML = `${clock.time}<span>:${clock.second}</span>`;
  $('#clock-date').textContent = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(`${clock.date}T12:00:00+09:00`));
  $('#clock-label').textContent = state.preview ? '미리보기 · 시간이 고정되어 있습니다' : '한국 표준시 · 자동 갱신';
  return clock;
}

function render() {
  if (!data) return;
  const clock = renderClock();
  lastMinute = `${clock.date} ${clock.time}`;
  $('#page-title').textContent = state.view === 'now' ? '지금, 현장에서' : state.view === 'guide' ? '함께, 차근차근' : '출근도, 준비도';
  document.querySelectorAll('.main-nav button').forEach(button => {
    button.classList.toggle('selected', button.dataset.view === state.view);
    if (button.dataset.view === state.view) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  $('#preview-banner').hidden = !state.preview;
  $('#preview-banner').innerHTML = state.preview ? `<span><strong>미리보기 중</strong> · ${dayLabel(clock.date)} ${clock.time} 기준입니다. 실제 현재 업무가 아닙니다.</span><button data-action="real-time">실제 시간으로</button>` : '';
  $('.toolbar').hidden = state.view === 'commute';
  $('#preview-controls').hidden = state.view === 'commute' || $('#preview-toggle').getAttribute('aria-expanded') !== 'true';
  $('#clear-search').hidden = !state.query;
  const openDetails = [...$('#content').querySelectorAll('details')].map((el,index)=>el.open ? index : -1).filter(index=>index>=0);
  const previousFocus = document.activeElement;
  const focusKey = previousFocus?.dataset?.guide || previousFocus?.dataset?.mode;
  $('#content').innerHTML = `${state.query && state.view !== 'commute' ? `<div class="search-result">“${escape(state.query)}” 검색 중 · 전체 공통 준비사항은 검색을 지우면 보입니다.</div>` : ''}${state.view === 'now' ? renderNow(clock) : state.view === 'guide' ? renderGuide(clock) : renderCommute()}`;
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
  if (button.dataset.view) navigate(button.dataset.view);
  if (button.dataset.guide) navigate('guide',button.dataset.guide);
  if (button.dataset.mode) { state.mode=button.dataset.mode;save('festival-weather',state.mode);render(); }
  if (button.dataset.action === 'real-time') resetPreview();
});
$('#search').addEventListener('input',event=>{state.query=event.target.value;render();});
$('#clear-search').addEventListener('click',()=>{state.query='';$('#search').value='';render();$('#search').focus();});
$('#preview-toggle').addEventListener('click',()=>{
  const expanded = $('#preview-toggle').getAttribute('aria-expanded') !== 'true';
  $('#preview-toggle').setAttribute('aria-expanded',String(expanded));
  $('#preview-controls').hidden=!expanded;
});
$('#preview-apply').addEventListener('click',()=>{
  if (!$('#preview-time').reportValidity()) return;
  state.preview={date:$('#preview-day').value,time:$('#preview-time').value};
  state.view='now';render();
});
function resetPreview(){state.preview=null;render();}
$('#preview-reset').addEventListener('click',resetPreview);
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
