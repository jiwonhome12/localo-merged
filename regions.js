// Layout sample copied from the reference's example snapshot, dated 2026-11-09.
// Marker offsets keep nearby district names legible on the nationwide map.
// Seven temporary travel-available regions are selected for the design demo,
// pending the future database connection; these are not live program statuses.
const regionGroups = {
  강원: [
    ['hwacheon', '화천군', 'open', 'new', 127.70, 38.12, -4, -4],
    ['pyeongchang', '평창군', 'closed', 'star', 128.52, 37.62, 29, -6],
    ['hoengseong', '횡성군', 'soon', '', 128.10, 37.50, -23, -1],
    ['yeongwol', '영월군', 'travel', 'star', 128.45, 37.19, 22, -7],
  ],
  충북: [
    ['jecheon', '제천시', 'closed', 'star', 128.16, 37.10, -21, 6],
  ],
  충남: [
    ['taean', '태안군', 'closed', 'star new', 126.25, 36.75, -28, -8],
    ['seocheon', '서천군', 'closed', 'new', 126.69, 36.09, -12, -5],
  ],
  경북: [
    ['andong', '안동시', 'travel', 'star new', 128.78, 36.58, 18, 4],
    ['yeongcheon', '영천시', 'open', 'new', 128.94, 36.00, 24, 2],
  ],
  경남: [
    ['geochang', '거창군', 'travel', 'star', 127.91, 35.72, 7, -17],
    ['hamyang', '함양군', 'travel', 'star new', 127.73, 35.56, -30, 2],
    ['hapcheon', '합천군', 'closed', 'star', 128.13, 35.56, 25, 2],
    ['sancheong', '산청군', 'soon', 'star new', 127.88, 35.41, 7, 22],
    ['hadong', '하동군', 'closed', 'star', 127.76, 35.20, -10, 36],
    ['miryang', '밀양시', 'closed', 'star', 128.77, 35.50, 35, 15],
    ['goseong', '고성군', 'closed', 'new', 128.32, 35.04, 38, 3],
    ['namhae', '남해군', 'travel', '', 127.94, 34.83, 45, 17],
  ],
  전북: [
    ['gochang', '고창군', 'travel', 'star', 126.66, 35.44, -7, -16],
  ],
  전남: [
    ['yeonggwang', '영광군', 'closed', 'star', 126.49, 35.27, -16, 2],
    ['yeongam', '영암군', 'open', 'star', 126.68, 34.80, -26, -13],
    ['jangheung', '장흥군', 'open', 'star new', 126.93, 34.68, -2, 10],
    ['gangjin', '강진군', 'travel', 'star', 126.77, 34.62, -57, 4],
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

const statuses = { travel: '여행 가능', open: '신청접수중', soon: '준비중', closed: '마감' };

const categories = {
  food: { name: '식당', symbol: '식', unit: '인분' },
  stay: { name: '숙박', symbol: '숙', unit: '실' },
  cafe: { name: '카페', symbol: '카', unit: '잔' },
  spot: { name: '관광지', symbol: '관', unit: '명' },
};

// Example businesses and prices used to exercise the layout.
const places = [
  { id: 'gc-soup', region: 'geochang', category: 'food', name: '읍내 국밥집', price: 9000, x: 22, y: -6 },
  { id: 'gc-stay', region: 'geochang', category: 'stay', name: '강변 펜션', price: 110000, x: -27, y: -23 },
  { id: 'gc-coffee', region: 'geochang', category: 'cafe', name: '로스터리 카페', price: 6500, x: 28, y: 19 },
  { id: 'gc-trail', region: 'geochang', category: 'spot', name: '생태 탐방로', price: 0, x: -23, y: 21 },
  { id: 'hy-beef', region: 'hamyang', category: 'food', name: '한우 정육식당', price: 26000, x: 20, y: -18 },
  { id: 'hy-stay', region: 'hamyang', category: 'stay', name: '숲길 스테이', price: 95000, x: -20, y: 9 },
  { id: 'hy-park', region: 'hamyang', category: 'spot', name: '천년 숲 산책로', price: 0, x: 23, y: 23 },
];
