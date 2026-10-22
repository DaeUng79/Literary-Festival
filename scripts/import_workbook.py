"""Read the source XLSX without extra dependencies; never modify the workbook."""
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else next(
    path for path in ROOT.parent.glob('*.xlsx')
    if '근무분장' in unicodedata.normalize('NFC', path.name))
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def clean(value):
    value = str(value or '').strip()
    # Vehicle identifiers are unnecessary for a publicly hosted staff guide.
    return re.sub(r'(?:벤츠\s*)?\d{2,3}\s*[가-힣]\s*\d{4}', '[차량번호 비공개]', value)


def coord(address):
    match = re.fullmatch(r'([A-Z]+)(\d+)', address)
    col = 0
    for char in match[1]:
        col = col * 26 + ord(char) - 64
    return int(match[2]), col


with zipfile.ZipFile(SOURCE) as archive:
    shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
    strings = [''.join(node.itertext()) for node in shared]
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    names = [s.attrib['name'] for s in workbook.find('s:sheets', NS)]
    sheets = {}
    for index, name in enumerate(names, 1):
        sheet = ET.fromstring(archive.read(f'xl/worksheets/sheet{index}.xml'))
        raw = {}
        for cell in sheet.findall('.//s:sheetData/s:row/s:c', NS):
            val = cell.find('s:v', NS)
            if val is not None:
                text = strings[int(val.text)] if cell.get('t') == 's' else val.text
                raw[coord(cell.get('r'))] = clean(text)
        merged = raw.copy()
        for merge in sheet.findall('.//s:mergeCell', NS):
            first, last = map(coord, merge.get('ref').split(':'))
            for row in range(first[0], last[0] + 1):
                for col in range(first[1], last[1] + 1):
                    merged[row, col] = raw.get(first, '')
        sheets[name] = (raw, merged)


def times(value):
    compact = re.sub(r'\s+', '', value)
    found = re.findall(r'(\d{1,2}):(\d{2})', compact)
    result = [f'{int(hour):02d}:{minute}' for hour, minute in found]
    return (result + [None, None])[:2]


def source(name, rows):
    return {'sheet': name, 'rows': rows}


assignments = []
for name, day in [('17일', 17), ('18일', 18), ('18일(우천시)', 18)]:
    raw, cells = sheets[name]
    rain = '우천' in name
    staff_col = 4 if rain else 3
    note_col = 6 if rain else 5
    # A heading and its following explanation form one readable card.
    join = {3: 4}
    if name == '17일':
        join[9] = 10
    if name == '18일':
        join[8] = 9
    if rain:
        join[14] = 15
    for row in range(2, max(r for r, c in raw) + 1):
        if row in join.values():
            continue
        category = cells.get((row, 1), '').strip()
        title = raw.get((row, 2), '')
        if not category and not title:
            continue
        rows = [row]
        if row in join:
            rows.append(join[row])
        detail = '\n\n'.join(raw.get((r, 2), '') for r in rows if raw.get((r, 2)))
        notes = '\n\n'.join(dict.fromkeys(cells.get((r, note_col), '') for r in rows if cells.get((r, note_col))))
        am = cells.get((row, staff_col), '')
        pm = cells.get((row, staff_col + 1), '')
        shifts = [{'label': '종일', 'start': '10:00', 'end': '17:00', 'staff': am}] if am == pm else [
            {'label': '오전', 'start': '10:00', 'end': '14:00', 'staff': am},
            {'label': '오후', 'start': '13:00', 'end': '17:00', 'staff': pm}]
        assignments.append({'id': f'{"rain" if rain else "duty"}-{day}-{row}', 'date': f'2026-10-{day}',
            'mode': 'rain' if rain else 'normal', 'category': category, 'title': title or category,
            'detail': detail, 'notes': notes, 'location': cells.get((row, 3), '') if rain else '',
            'shifts': shifts, 'source': source(name, rows)})

schedules = []
for day in [17, 18]:
    name = f'{day}일 (세부분장)'
    raw, cells = sheets[name]
    for row in range(4, max(r for r, c in raw) + 1):
        if not raw.get((row, 2)):
            continue
        start, end = times(raw.get((row, 1), ''))
        event = {'id': f'event-{day}-{row}', 'date': f'2026-10-{day}', 'mode': 'normal',
            'start': start, 'end': end, 'originalTime': raw.get((row, 1), ''),
            'title': raw.get((row, 2), ''), 'staff': raw.get((row, 3), ''),
            'notes': raw.get((row, 4), ''), 'location': '', 'source': source(name, [row])}
        if day == 18 and row == 20:
            event.update(title='부시장님 행사장 라운딩 (당초 예정, 취소)', cancelled=True)
        schedules.append(event)

# Rain mode is built only from the rain sheet. Do not mix in outdoor instructions.
rain_times = {6: ('11:00', None), 7: ('11:00', '11:30'), 8: ('11:30', '12:00'),
              9: ('12:50', None), 10: ('13:00', '13:20'), 11: ('13:20', '13:40'),
              12: ('13:20', None), 14: ('14:00', '15:30')}
for item in [a for a in assignments if a['mode'] == 'rain']:
    row = item['source']['rows'][0]
    if row not in rain_times:
        continue
    start, end = rain_times[row]
    schedules.append({'id': f'rain-event-{row}', 'date': item['date'], 'mode': 'rain',
        'start': start, 'end': end, 'originalTime': f'{start} ~ {end or ""}',
        'title': item['title'], 'staff': item['shifts'][0]['staff'], 'notes': item['notes'],
        'location': item['location'], 'source': item['source']})
for start, title, row in [('09:00', '시상식 리허설(직원)', 15), ('12:20', '시상식 리허설(책 읽는 가족)', 15),
                           ('18:30', '작가님 물금역 출발 확인', 12)]:
    schedules.append({'id': f'rain-extra-{start}', 'date': '2026-10-18', 'mode': 'rain',
        'start': start, 'end': None, 'originalTime': start + ' ~', 'title': title,
        'staff': sheets['18일(우천시)'][0].get((12, 4), '') if row == 12 else '', 'notes': '', 'location': '물금역' if row == 12 else '',
        'source': source('18일(우천시)', [row])})

for day, mode in [(17, 'normal'), (18, 'normal'), (18, 'rain')]:
    for hour, team in [('07:00', '중앙팀'), ('08:00', '중앙팀 외')]:
        schedules.append({'id': f'arrival-{day}-{mode}-{hour}', 'date': f'2026-10-{day}', 'mode': mode,
            'start': hour, 'end': None, 'originalTime': hour + '까지', 'title': f'{team} 출근 확인 · 준비 시작',
            'staff': team, 'notes': '안내부스에서 근무복·명찰·커피 쿠폰 수령 후 배치 업무에 따라 물품 세팅',
            'location': '중앙도서관', 'source': {'sheet': '담당자 제공 출퇴근 안내', 'rows': []}})

payload = {'meta': {'title': '양산시 독서문화축전', 'dates': ['2026-10-17', '2026-10-18'],
    'sourceFile': SOURCE.name, 'updatedAt': '2026-10-15', 'timeZone': 'Asia/Seoul',
    'dateNote': '원본의 2026년·17일(토)·18일(일)과 요청 시점을 기준으로 10월로 설정했습니다.',
    'notices': ['17일 상세일정의 “15:4 5~”는 15:45로 읽었습니다.',
        '일반·우천 업무분장의 “시장님”과 18일 세부분장의 “부시장님” 표기가 다릅니다. 현장 담당자 확인이 필요합니다.',
        '대기표 안내의 12:58과 상세일정의 12:57 입장 시각을 원문대로 유지했습니다. 현장 안내 시 확인하세요.',
        '차량번호는 공개용 자료에서 비공개 처리했습니다.']},
    'assignments': assignments, 'schedules': schedules,
    'commute': {'source': '담당자 제공 안내 · 2026.10.15', 'arrivals': [
        {'team': '중앙팀', 'time': '07:00'}, {'team': '중앙팀 외', 'time': '08:00'}],
        'place': '중앙도서관', 'preparation': [
            '안내부스에서 근무복 및 명찰, 커피 쿠폰 수령',
            '중앙도서관으로 출근 후 배치 업무에 따라 1층 어울림자료실에서 물품을 챙겨서 세팅',
            '야외부스 의자 세팅 등 그 외 업무 지원'],
        'assignmentNotes': ['오전/오후 업무가 다릅니다. 직원 2인 이상 배치된 곳은 상황을 보고 다른 행사를 지원해주세요.',
            '분장별 상세 업무는 토요일 오전 별도로 설명 예정입니다. 세부내용을 꼭 읽어주세요.'],
        'attendance': '구분없이 초과사전 올려주시고, 양일간 인사랑에 출퇴근 확인해주세요.(근무자 제외)',
        'unconfirmed': '퇴근 시각, 직원 주차 위치, 셔틀·차량 이용 방법, 차출경비·대체휴무 세부 기준은 제공된 안내에 없습니다. 현장 총괄에게 확인해주세요.',
        'mealPlace': {'name': '용마루숯불가든 양산본점', 'location': '물금역 앞',
            'url': 'https://place.map.kakao.com/155775398'}}}
# Derive names from assignment fields at import time. The public repository never
# needs a checked-in table that maps pseudonyms back to real people.
family_names = set('김이박최정조윤유류신여양안서송문장지심변전채강오방옥')
staff_text = [item['staff'] for item in schedules]
staff_text += [shift['staff'] for item in assignments for shift in item['shifts']]
people = {token for text in staff_text for token in re.findall(r'[가-힣]{3,4}', text)
          if len(token) == 3 and token[0] in family_names}
for raw, _ in sheets.values():
    for text in raw.values():
        people.update(re.findall(r'([가-힣]{3})\s*(?:작가|쌤)', text))
aliases = {}
for person in people:
    aliases.setdefault(person[1:], set()).add(person)
aliases = {alias: next(iter(owners)) for alias, owners in aliases.items() if len(owners) == 1}
pseudonyms = {}
for person in sorted(people):
    base = person[0] + 'O' + person[-1]
    peers = sorted(other for other in people if other[0] == person[0] and other[-1] == person[-1])
    pseudonyms[person] = base if len(peers) == 1 else f'{base}({peers.index(person) + 1})'


def public_text(text):
    for person in sorted(people):
        text = text.replace(person, pseudonyms[person])
    for alias, person in aliases.items():
        text = re.sub(r'(?<![가-힣])' + re.escape(alias) + r'(?![가-힣])',
                      pseudonyms[person], text)
    # One colloquial two-syllable nickname in the workbook is not a real name.
    text = text.replace('신쩡', '신O정(확인)')
    return text


def redact(value):
    if isinstance(value, str):
        return public_text(value)
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    return value


payload = redact(payload)
(ROOT / 'dist' / 'data.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
print(f'Imported {len(assignments)} duty cards and {len(schedules)} schedule rows from {len(names)} sheets.')
