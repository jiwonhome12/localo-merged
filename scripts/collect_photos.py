"""장소 대표 사진을 모은다 → data/place-photos.json

출처는 이용 조건이 분명한 공개 자료만 쓴다.
  1) 한국관광공사 TourAPI 4.0(공공데이터포털) 대표 이미지 — TOURAPI_KEY 가 있을 때.
     공공누리 1유형(출처표시) · 3유형(출처표시·변경금지)만 쓴다.
  2) 한국어 위키백과 문서의 대표 사진 — 장소 근처(300m) 문서 중 제목이 상호와 맞는 것. 위키미디어 공용의 자유 라이선스 사진만.
  3) 위키미디어 공용(Wikimedia Commons) 위치 검색 — 키 없이 동작. CC0·CC BY·CC BY-SA·퍼블릭 도메인만 쓴다.
카카오·네이버 지도의 장소 사진은 이용자·업체가 올린 저작물이라 가져오지 않는다.

맞추는 규칙(엉뚱한 사진을 막기 위해 엄격하게):
  - 좌표가 가까워야 한다(TourAPI 300m, 공용 150m 안).
  - 이름도 맞아야 한다(공백·괄호·지역 이름을 뺀 상호가 서로 포함 관계).
사진 파일은 저장하지 않고 원본 주소만 기록한다. 화면은 출처·라이선스를 함께 보여 준다.

    python scripts/collect_photos.py              # 둘 다(키가 없으면 공용만)
    python scripts/collect_photos.py --only commons
    python scripts/collect_photos.py --only tour
"""
import argparse
import concurrent.futures
import html
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'place-photos.json'
UA = 'localo-photo-collector/1.0 (https://github.com/jiwonhome12/localo-merged)'

env = ROOT / '.env'
if env.exists():
    for line in env.read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"\''))

places = [p for p in json.loads((ROOT / 'data' / 'places.json').read_text(encoding='utf-8'))
          if not p.get('sample') and p.get('lat') is not None and not p.get('approx')]
regions = {r['id']: r for r in json.loads((ROOT / 'data' / 'regions.json').read_text(encoding='utf-8'))}


def km(a_lat, a_lng, b_lat, b_lng):
    t = math.pi / 180
    h = math.sin((b_lat - a_lat) * t / 2) ** 2 + math.cos(a_lat * t) * math.cos(b_lat * t) * math.sin((b_lng - a_lng) * t / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


GENERIC = ('관광지', '유원지', '국민관광지', '관광단지', '본점', '점')


def core(name, rid=None):
    """비교용 상호: 괄호·공백·기호와 앞의 지역 이름을 뺀다."""
    s = re.sub(r'\(.*?\)|\[.*?\]', '', str(name or ''))
    s = re.sub(r'[^0-9A-Za-z가-힣]', '', s).lower()
    if rid and rid in regions:
        short = regions[rid]['name'][:-1]
        for pre in (regions[rid]['name'], short):
            if s.startswith(pre) and len(s) - len(pre) >= 2:
                s = s[len(pre):]
                break
    for g in GENERIC:
        if s.endswith(g) and len(s) - len(g) >= 2:
            s = s[:-len(g)]
            break
    return s


def same_name(a, b):
    return len(a) >= 2 and len(b) >= 2 and (a in b or b in a)


def get_json(url, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:  # 요청이 많다(429)·서버 오류(5xx)면 기다렸다 다시
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                print('  요청 실패:', e.code, file=sys.stderr)
                return None
            wait = e.headers.get('Retry-After')
            time.sleep(float(wait) if wait and wait.isdigit() else 5 * (i + 1))
        except Exception as e:  # 잠깐 실패는 다시
            if i == tries - 1:
                print('  요청 실패:', str(e)[:120], file=sys.stderr)
                return None
            time.sleep(1.5 * (i + 1))


# ── 1) TourAPI ─────────────────────────────────────────────
TOUR_LICENSE = {
    'Type1': ('공공누리 제1유형(출처표시)', 'https://www.kogl.or.kr/info/licenseType1.do'),
    'Type3': ('공공누리 제3유형(출처표시·변경금지)', 'https://www.kogl.or.kr/info/licenseType3.do'),
}


def tour_items_near(key, lat, lng, radius):
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({'MobileOS': 'ETC', 'MobileApp': 'localo', '_type': 'json', 'mapX': f'{lng:.6f}', 'mapY': f'{lat:.6f}',
                                    'radius': radius, 'numOfRows': 1000, 'pageNo': page, 'arrange': 'E'})
        data = get_json(f'https://apis.data.go.kr/B551011/KorService2/locationBasedList2?serviceKey={key}&{q}')
        body = (((data or {}).get('response') or {}).get('body') or {})
        got = ((body.get('items') or {}) or {}).get('item') or []
        if isinstance(got, dict):
            got = [got]
        items += got
        if page * 1000 >= int(body.get('totalCount') or 0) or not got:
            return items
        page += 1
        time.sleep(0.3)


def collect_tour(key, found):
    by_region = {}
    for p in places:
        by_region.setdefault(p['region_id'], []).append(p)
    for rid, ps in by_region.items():
        # 지역 장소들을 덮도록 반경 20km(최대) 원 여러 개로 나눠 조회
        lats = [p['lat'] for p in ps]; lngs = [p['lng'] for p in ps]
        step_lat, step_lng = 0.25, 0.3
        pool = {}
        lat = min(lats)
        while lat <= max(lats) + 1e-9:
            lng = min(lngs)
            while lng <= max(lngs) + 1e-9:
                for it in tour_items_near(key, lat + step_lat / 2, lng + step_lng / 2, 20000):
                    if it.get('firstimage'):
                        pool[it['contentid']] = it
                lng += step_lng
            lat += step_lat
        n = 0
        for p in ps:
            if p['id'] in found:
                continue
            pc = core(p['name'], rid)
            best = None
            for it in pool.values():
                lic = TOUR_LICENSE.get(it.get('cpyrhtDivCd'))
                if not lic:
                    continue
                try:
                    d = km(p['lat'], p['lng'], float(it['mapy']), float(it['mapx']))
                except (KeyError, ValueError):
                    continue
                if d <= 0.3 and same_name(pc, core(it.get('title'), rid)) and (not best or d < best[0]):
                    best = (d, it, lic)
            if best:
                d, it, lic = best
                found[p['id']] = {
                    'src': it['firstimage'].replace('http://', 'https://', 1), 'thumb': (it.get('firstimage2') or it['firstimage']).replace('http://', 'https://', 1),
                    'title': it.get('title'), 'credit': '한국관광공사', 'license': lic[0], 'licenseUrl': lic[1],
                    'source': f"https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid={it.get('contentid', '')}",
                    'via': 'tourapi', 'distance_m': round(d * 1000),
                }
                n += 1
        print(f'  TourAPI {regions[rid]["name"]}: 후보 {len(pool)} · 맞춤 {n}')


# ── 2) 위키미디어 공용 ─────────────────────────────────────
OK_LICENSE = re.compile(r'^(cc0|cc[- ]by(-sa)?[- ][\d.]+.*|public domain|pd.*|공공누리.*1.*)$', re.I)


def strip_tags(s):
    return html.unescape(re.sub(r'<[^>]+>', '', str(s or ''))).strip()


def commons_info(titles):
    """공용 파일들의 라이선스·작성자·썸네일. {제목: (썸네일, 라이선스, 라이선스 주소, 작성자, 설명 주소, 글자)}"""
    out = {}
    for k in range(0, len(titles), 40):
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'titles': '|'.join(titles[k:k + 40]), 'prop': 'imageinfo',
                                    'iiprop': 'url|extmetadata|mime', 'iiurlwidth': 640})
        data = get_json('https://commons.wikimedia.org/w/api.php?' + q) or {}
        for pg in ((data.get('query') or {}).get('pages') or {}).values():
            ii = (pg.get('imageinfo') or [{}])[0]
            if ii.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
                continue
            md = ii.get('extmetadata') or {}
            lic = strip_tags((md.get('LicenseShortName') or {}).get('value'))
            if not OK_LICENSE.match(lic):
                continue
            text = ' '.join([pg.get('title', ''), strip_tags((md.get('ObjectName') or {}).get('value')), strip_tags((md.get('ImageDescription') or {}).get('value'))])
            out[pg.get('title')] = (ii.get('thumburl') or ii.get('url'), lic, (md.get('LicenseUrl') or {}).get('value') or ii.get('descriptionurl'),
                                    strip_tags((md.get('Artist') or {}).get('value'))[:80] or '위키미디어 공용', ii.get('descriptionurl'), text)
    return out


# 사진이 아닌 그림(우표·안내도·지도·포스터·로고)은 대표 사진으로 쓰지 않는다
NOT_PHOTO = re.compile(r'우표|stamp|가이드맵|안내도|지도|map|포스터|poster|로고|logo|도면|svg', re.I)
# 사람이 검토해서 틀린 연결로 판단한 것: {장소 이름: 이유}
REJECT = {'가은산': '다른 유적(가혜성) 사진',
          '상주은모래비치': '해수욕장에 캠핑장 사진', '소등섬민박': '숙소에 섬 사진'}


def record(src, title, lic, lic_url, credit, source, via):
    return {'src': src, 'title': title.replace('File:', ''), 'credit': credit, 'license': lic, 'licenseUrl': lic_url, 'source': source, 'via': via}


def kowiki_one(p):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'geosearch', 'ggscoord': f"{p['lat']}|{p['lng']}",
                                'ggsradius': 300, 'ggslimit': 20, 'prop': 'pageimages', 'piprop': 'name', 'pilicense': 'free'})
    data = get_json('https://ko.wikipedia.org/w/api.php?' + q) or {}
    pc = core(p['name'], p['region_id'])
    for pg in sorted(((data.get('query') or {}).get('pages') or {}).values(), key=lambda x: x.get('index', 99)):
        if pg.get('pageimage') and same_name(pc, core(pg.get('title'), p['region_id'])):
            info = commons_info(['File:' + pg['pageimage']]).get('File:' + pg['pageimage'].replace('_', ' '))
            if info:
                src, lic, lic_url, credit, source, _ = info
                r = record(src, pg['pageimage'], lic, lic_url, credit, source, 'kowiki')
                r['article'] = 'https://ko.wikipedia.org/wiki/' + urllib.parse.quote(pg['title'].replace(' ', '_'))
                return r
    return None


def commons_one(p):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'geosearch', 'gscoord': f"{p['lat']}|{p['lng']}",
                                'gsradius': 150, 'gslimit': 30, 'gsnamespace': 6})
    data = get_json('https://commons.wikimedia.org/w/api.php?' + q) or {}
    titles = [g['title'] for g in ((data.get('query') or {}).get('geosearch') or [])]
    if not titles:
        return None
    pc = core(p['name'], p['region_id'])
    for t, (src, lic, lic_url, credit, source, text) in commons_info(titles).items():
        if same_name(pc, re.sub(r'[^0-9A-Za-z가-힣]', '', text).lower()):
            return record(src, t, lic, lic_url, credit, source, 'commons')
    return None


def run_pass(name, fn, found, cats=('spot',)):
    targets = [p for p in places if p['category'] in cats and p['id'] not in found]
    print(f'  {name}: 장소 {len(targets)}곳 조회')
    done = 0
    with concurrent.futures.ThreadPoolExecutor(2) as ex:
        for p, r in zip(targets, ex.map(fn, targets)):
            done += 1
            if r and (NOT_PHOTO.search(r['title']) or p['name'] in REJECT):
                print(f"    건너뜀 {p['name']} ← {r['title']}")
                r = None
            if r:
                found[p['id']] = r
                print(f"    {regions[p['region_id']]['name']} {p['name']} ← {r['title']} ({r['license']})")
            if done % 200 == 0:
                print(f'    … {done}/{len(targets)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['tour', 'commons'], help='commons = 위키백과 + 위키미디어 공용')
    a = ap.parse_args()
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    found = {}
    key = os.environ.get('TOURAPI_KEY', '').strip()
    if a.only != 'commons':
        if key:
            print('TourAPI 대표 이미지 조회')
            collect_tour(key, found)
        else:
            print('TOURAPI_KEY 가 없어 TourAPI 는 건너뜀(공공데이터포털에서 한국관광공사_국문 관광정보 서비스 활용 신청)')
            found.update({k: v for k, v in (old.get('photos') or {}).items() if v.get('via') == 'tourapi' and any(p['id'] == k for p in places)})
    if a.only != 'tour':
        print('위키백과·위키미디어 공용 조회')
        run_pass('한국어 위키백과 대표 사진', kowiki_one, found)
        run_pass('위키미디어 공용 위치 검색', commons_one, found)
    else:
        found.update({k: v for k, v in (old.get('photos') or {}).items() if v.get('via') in ('commons', 'kowiki') and k not in found})
    names = {p['id']: p['name'] for p in places}
    found = {k: v for k, v in found.items() if names.get(k) not in REJECT and not NOT_PHOTO.search(v.get('title') or '')}
    OUT.write_text(json.dumps({'updated': date.today().isoformat(), 'count': len(found), 'photos': dict(sorted(found.items()))},
                              ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'→ {OUT.relative_to(ROOT)}: 사진 {len(found)}곳')


if __name__ == '__main__':
    main()
