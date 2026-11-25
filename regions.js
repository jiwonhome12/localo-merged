// Layout sample copied from the reference's example snapshot, dated 2026-11-09.
// Marker offsets keep nearby district names legible on the nationwide map.
const regionGroups = {
  강원: [
    ['hwacheon', '화천군', 'open', 'new', 127.70, 38.12, -4, -4],
    ['pyeongchang', '평창군', 'closed', 'star', 128.52, 37.62, 29, -6],
    ['hoengseong', '횡성군', 'soon', '', 128.10, 37.50, -23, -1],
    ['yeongwol', '영월군', 'open', 'star', 128.45, 37.19, 22, -7],
  ],
  충북: [
    ['jecheon', '제천시', 'closed', 'star', 128.16, 37.10, -21, 6],
  ],
  충남: [
    ['taean', '태안군', 'closed', 'star new', 126.25, 36.75, -28, -8],
    ['seocheon', '서천군', 'closed', 'new', 126.69, 36.09, -12, -5],
  ],
  경북: [
    ['andong', '안동시', 'closed', 'star new', 128.78, 36.58, 18, 4],
    ['yeongcheon', '영천시', 'open', 'new', 128.94, 36.00, 24, 2],
  ],
  경남: [
    ['geochang', '거창군', 'open', 'star', 127.91, 35.72, 7, -17],
    ['hamyang', '함양군', 'open', 'star new', 127.73, 35.56, -30, 2],
    ['hapcheon', '합천군', 'closed', 'star', 128.13, 35.56, 25, 2],
    ['sancheong', '산청군', 'soon', 'star new', 127.88, 35.41, 7, 22],
    ['hadong', '하동군', 'closed', 'star', 127.76, 35.20, -10, 36],
    ['miryang', '밀양시', 'closed', 'star', 128.77, 35.50, 35, 15],
    ['goseong', '고성군', 'closed', 'new', 128.32, 35.04, 38, 3],
    ['namhae', '남해군', 'closed', '', 127.94, 34.83, 45, 17],
  ],
  전북: [
    ['gochang', '고창군', 'open', 'star', 126.66, 35.44, -7, -16],
  ],
  전남: [
    ['yeonggwang', '영광군', 'closed', 'star', 126.49, 35.27, -16, 2],
    ['yeongam', '영암군', 'open', 'star', 126.68, 34.80, -26, -13],
    ['jangheung', '장흥군', 'open', 'star new', 126.93, 34.68, -2, 10],
    ['gangjin', '강진군', 'open', 'star', 126.77, 34.62, -57, 4],
    ['haenam', '해남군', 'closed', 'star', 126.60, 34.56, -57, 34],
    ['goheung', '고흥군', 'closed', 'star', 127.28, 34.60, 36, 10],
    ['wando', '완도군', 'closed', 'star', 126.75, 34.33, 6, 13],
  ],
};

const regions = Object.entries(regionGroups).flatMap(([province, entries]) =>
  entries.map(([id, name, status, flags, lon, lat, offsetX, offsetY]) => ({
    id, name, status, province, lon, lat, offsetX, offsetY,
    star: flags.includes('star'),
    newRegion: flags.includes('new'),
    shortName: name.slice(0, -1),
  })),
);

const statuses = { open: '신청접수중', soon: '준비중', closed: '마감' };

// 2026 municipal program sites listed by the Korea Tourism Organization:
// https://m.visitkorea.or.kr/dgtourcard/tour50.do
// Where the operator publishes a direct application form, use that entry point.
const reservationSites = {
  hwacheon: { url: 'https://ihctour.kr/forms/apply.php?gp_id=28' },
  pyeongchang: { url: 'https://pc.halftrip.kr/Home/H120000/H120100/register' },
  hoengseong: { url: 'https://hs.halftrip.kr/Home/H120000/H120100/register' },
  yeongwol: { url: 'https://halftour.kr/forms/apply.php?gp_id=74' },
  jecheon: { url: 'https://www.jctour.kr/', label: '신청 안내' },
  taean: { url: 'https://taeantour.kr/forms/apply.php?gp_id=59' },
  seocheon: { url: 'https://seocheontour.kr/forms/apply.php?gp_id=78' },
  andong: { url: 'https://andonghalftour.kr/forms/apply.php?gp_id=71' },
  yeongcheon: { url: 'https://yctour.kr/forms/apply.php?gp_id=54' },
  geochang: { url: 'https://geochangtour.kr/bbs/apply_date.php' },
  hamyang: { url: 'https://hytour.kr/forms/apply.php?gp_id=52' },
  hapcheon: { url: 'https://www.hctour.kr/', label: '신청 안내' },
  sancheong: { url: 'https://sancheongtour.kr/forms/apply.php?gp_id=79' },
  hadong: { url: 'https://hadongtrip.kr/index.php', label: '신청 안내' },
  miryang: { url: 'https://www.mybanhada.com/apply/detail' },
  goseong: { url: 'https://healinggoseong.kr/apply.html#apply-form' },
  namhae: { url: 'https://www.namhae.go.kr/tour/main.web', label: '신청 안내' },
  gochang: { url: 'https://gochangtrip.co.kr/bbs/apply_date.php' },
  yeonggwang: { url: 'https://www.yeonggwang.go.kr/travel/', label: '신청 안내' },
  yeongam: { url: 'https://www.yeongam.go.kr/oneplusone', label: '신청 안내' },
  jangheung: { url: 'https://www.jangheung.go.kr/travel', label: '신청 안내' },
  gangjin: { url: 'https://www.gangjintour.com/', label: '신청 안내' },
  haenam: { url: 'https://www.haenam50.kr/index', label: '신청 안내' },
  goheung: { url: 'https://tour.goheung.go.kr/front/M0000362/rsvh/apply.do' },
  wando: { url: 'https://www.wandotrip.kr/bbs/apply_date.php' },
};

// Dated sample application windows are used by both the map and the calendar.
const applicationPeriods = [
  { region: 'andong', type: 'application', start: '2026-11-02', end: '2026-11-08' },
  { region: 'gochang', type: 'application', start: '2026-11-12', end: '2026-11-19', closingTime: '18:00' },
  { region: 'geochang', type: 'application', start: '2026-11-16', end: '2026-11-22', closingTime: '17:00' },
  { region: 'hamyang', type: 'application', start: '2026-11-23', end: '2026-11-28' },
];

// Sample travel windows shared by the calendar and the map. The status in
// regionGroups describes applications, which may close before travel begins.
const travelPeriods = [
  { region: 'andong', type: 'travel', start: '2026-11-13', end: '2026-11-22' },
  { region: 'gochang', type: 'travel', start: '2026-11-20', end: '2026-11-30' },
  { region: 'geochang', type: 'travel', start: '2026-11-21', end: '2026-12-06' },
  { region: 'hamyang', type: 'travel', start: '2026-11-29', end: '2026-12-13' },
];

const categories = {
  food: { name: '식당', symbol: '식', unit: '인분', icon: '<path d="M5 3v6c0 3 5 3 5 0V3M7.5 3v18M19 21v-8h-4c0-6 2-9 4-10z"/>' },
  stay: { name: '숙박', symbol: '숙', unit: '실', icon: '<path d="M3 5v15m18-9v9M3 16h18M9 9h8a4 4 0 0 1 4 4v3H9z"/><circle cx="6" cy="10" r="1.4"/>' },
  cafe: { name: '카페', symbol: '카', unit: '잔', icon: '<path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM17 9h2a3 3 0 0 1 0 6h-2M3 21h16M8 3v2m4-2v2"/>' },
  spot: { name: '관광지', symbol: '관', unit: '명', icon: '<path d="m2 19 7-11 5 7 3-5 5 9z"/><circle cx="16" cy="5.5" r="1.7"/>' },
};

// Example locations are offsets in projected map units, inside the corresponding district.
const places = [
  { id: 'gc-soup', region: 'geochang', locality: '거창읍', category: 'food', name: '읍내 국밥집', price: 9000, x: 1, y: -0.6, featured: true },
  { id: 'gc-stay', region: 'geochang', locality: '거창읍', category: 'stay', name: '강변 펜션', price: 110000, x: -0.3, y: -1.7 },
  { id: 'gc-coffee', region: 'geochang', locality: '거창읍', category: 'cafe', name: '로스터리 카페', price: 6500, x: -1.8, y: -0.6 },
  { id: 'gc-trail', region: 'geochang', locality: '거창읍', category: 'spot', name: '생태 탐방로', price: 0, x: 0.1, y: 1.4, featured: true },
  { id: 'hy-beef', region: 'hamyang', locality: '함양읍', category: 'food', name: '한우 정육식당', price: 26000, x: -0.3, y: -0.7, featured: true },
  { id: 'hy-stay', region: 'hamyang', locality: '함양읍', category: 'stay', name: '숲길 스테이', price: 95000, x: -0.4, y: -1.9 },
  { id: 'hy-park', region: 'hamyang', locality: '함양읍', category: 'spot', name: '천년 숲 산책로', price: 0, x: -0.4, y: 2, featured: true },
  { id: 'gch-soup', region: 'gochang', locality: '고창읍', category: 'food', name: '시장 국밥집', price: 9000, x: 0.5, y: -1.2, photo: 'gc-soup', featured: true },
  { id: 'gch-cafe', region: 'gochang', locality: '고창읍', category: 'cafe', name: '들녘 카페', price: 6000, x: -1.8, y: -0.1, photo: 'gc-coffee' },
  { id: 'gch-path', region: 'gochang', locality: '고창읍', category: 'spot', name: '고창 산책길', price: 0, x: -1.1, y: 1.2, photo: 'gc-trail', featured: true },
];
