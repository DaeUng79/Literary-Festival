import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seoulNow, status, activeShifts, selectSchedule, matches, minutes } from '../dist/core.js';
const data = JSON.parse(fs.readFileSync(new URL('../dist/data.json',import.meta.url)));
const at = (time,date='2026-10-18')=>({date,time});

test('한국 시간 변환과 자정의 날짜 전환',()=>{
  assert.deepEqual(seoulNow(new Date('2026-10-16T22:00:00Z')),{date:'2026-10-17',time:'07:00',second:'00'});
  assert.equal(seoulNow(new Date('2026-10-17T15:00:00Z')).date,'2026-10-18');
});
test('진행 중 업무: 시작 포함, 종료 제외',()=>{
  const event={date:'2026-10-18',start:'13:20',end:'13:40'};
  assert.equal(status(event,at('13:19')),'soon');
  assert.equal(status(event,at('13:20')),'active');
  assert.equal(status(event,at('13:39')),'active');
  assert.equal(status(event,at('13:40')),'ended');
  assert.equal(status(event,at('13:20','2026-10-17')),'future-day');
  assert.equal(status(event,at('13:20','2026-10-19')),'past-day');
});
test('종료 없는 업무는 15분 알림 후 시작 시각 지남으로 처리',()=>{
  const event={date:'2026-10-18',start:'12:50',end:null};
  assert.equal(status(event,at('12:50')),'starting');
  assert.equal(status(event,at('13:04')),'starting');
  assert.equal(status(event,at('13:05')),'started');
});
test('13~14시 두 근무조를 유지하며 14시 이후 오전조 제외',()=>{
  const item=data.assignments.find(x=>x.id==='duty-18-12');
  assert.equal(activeShifts(item,at('09:59')).length,0);
  assert.equal(activeShifts(item,at('10:00')).length,1);
  assert.equal(activeShifts(item,at('13:00')).length,2);
  assert.equal(activeShifts(item,at('13:59')).length,2);
  assert.deepEqual(activeShifts(item,at('14:00')).map(s=>s.label),['오후']);
  assert.equal(activeShifts(item,at('17:00')).length,0);
  assert.equal(activeShifts(item,at('13:00','2026-10-17')).length,0);
});
test('일반/우천 일정 분리, 우천 이동 장소 보존',()=>{
  const rain=selectSchedule(data,'2026-10-18','rain');
  assert.ok(rain.every(e=>e.mode==='rain'));
  assert.equal(rain.find(e=>e.id==='rain-event-14').location,'관설당');
  assert.equal(rain.find(e=>e.id==='rain-event-10').location,'1층 로비');
  assert.ok(!rain.some(e=>e.title.includes('야외무대 뒷편')));
  assert.ok(selectSchedule(data,'2026-10-17','rain').every(e=>e.mode==='normal'));
});
test('여러 동시 업무와 시각 역순 원본을 시간순 정렬',()=>{
  const events=selectSchedule(data,'2026-10-18','normal');
  const live=events.filter(e=>status(e,at('13:35'))==='active');
  assert.ok(live.some(e=>e.title.includes('시상식')));
  assert.ok(live.some(e=>e.title.includes('단상 중앙 이동')));
  assert.ok(events.findIndex(e=>e.title==='인형극 리허설') < events.findIndex(e=>e.title==='사인회 진행'));
});
test('원본 변환 건수와 유효한 시각, 중복 ID, 차량번호 제거',()=>{
  assert.equal(data.assignments.length,61);
  assert.equal(data.schedules.length,69);
  const all=[...data.assignments,...data.schedules];
  assert.equal(new Set(all.map(e=>e.id)).size,all.length);
  for(const e of data.schedules){assert.match(e.start,/^(0\d|1\d|2[0-3]):[0-5]\d$/);if(e.end)assert.ok(minutes(e.end)>minutes(e.start));}
  assert.ok(!JSON.stringify(data).includes('257무'));
  assert.equal(data.schedules.find(e=>e.id==='event-17-24').start,'15:45');
});
test('병합 셀 담당자 및 우천 장소의 상속 보존',()=>{
  assert.equal(data.assignments.find(e=>e.id==='duty-17-3').shifts[0].staff,'양현정, 이채령');
  assert.ok(data.assignments.find(e=>e.id==='duty-17-3').detail.includes('매시간 36명'));
  assert.equal(data.assignments.find(e=>e.id==='rain-18-25').location,'2층 복도');
  assert.equal(data.schedules.find(e=>e.id==='rain-event-8').staff,'장희진, 김정해');
});
test('담당자, 원문의 별칭, 공백 및 장소 검색',()=>{
  assert.ok(matches({staff:'윤영'},'서윤영'));
  assert.ok(matches({title:'동화 구연',location:'관설당'},'동화 관설당'));
  assert.ok(!matches({staff:'이영주'},'김현지'));
});
test('주신 출퇴근 정보와 양일 출근 알림 포함',()=>{
  assert.deepEqual(data.commute.arrivals.map(x=>x.time),['07:00','08:00']);
  assert.ok(data.commute.attendance.includes('(근무자 제외)'));
  for(const [date,mode] of [['2026-10-17','normal'],['2026-10-18','normal'],['2026-10-18','rain']]){
    assert.equal(selectSchedule(data,date,mode).filter(e=>status(e,at('07:00',date))==='starting').length,1);
  }
});
