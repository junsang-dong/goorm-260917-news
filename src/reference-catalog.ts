import type { Analysis, Content, Source } from '../shared/schemas';
import { classify, dedup } from './domain';

type CatalogEntry = {
  name: string;
  url: string;
  type: 'news' | 'video';
  group: '로봇 뉴스' | '기업 공식 사이트' | 'YouTube 채널';
  focus: string;
};

export const referenceCatalog: CatalogEntry[] = [
  { name: 'The Robot Report', url: 'https://www.therobotreport.com/', type: 'news', group: '로봇 뉴스', focus: '로봇 기업, 투자·인수합병, 제품 출시, 제조·물류·서비스 로봇' },
  { name: 'IEEE Spectrum Robotics', url: 'https://spectrum.ieee.org/topic/robotics', type: 'news', group: '로봇 뉴스', focus: '로봇공학, 자율주행, 휴머노이드, 제어, 센서, 연구 성과' },
  { name: 'Robotics & Automation News', url: 'https://roboticsandautomationnews.com/', type: 'news', group: '로봇 뉴스', focus: '산업 자동화, 제조, 물류, 자율주행, 로봇 기업 뉴스' },
  { name: 'Robohub', url: 'https://robohub.org/', type: 'news', group: '로봇 뉴스', focus: '로봇 연구, 로봇공학자 인터뷰, AI·자율성·사회적 영향' },
  { name: 'Robotics Business Review', url: 'https://www.roboticsbusinessreview.com/', type: 'news', group: '로봇 뉴스', focus: '로봇 시장, 비즈니스 모델, 투자, 도입 사례, 기업 전략' },
  { name: 'Robotics 24/7', url: 'https://www.robotics247.com/', type: 'news', group: '로봇 뉴스', focus: '물류 로봇, 창고 자동화, AMR·AGV, 공급망' },
  { name: 'Tech Xplore Robotics', url: 'https://techxplore.com/robotics-news/', type: 'news', group: '로봇 뉴스', focus: '대학·연구기관의 로봇 논문과 기술 성과' },
  { name: 'MIT News Robotics', url: 'https://news.mit.edu/topic/robotics', type: 'news', group: '로봇 뉴스', focus: '조작, 로봇 학습, 인간-로봇 협업, 소프트 로봇' },
  { name: '로봇신문', url: 'https://www.irobotnews.com/', type: 'news', group: '로봇 뉴스', focus: '국내 로봇 기업, 정책, 전시회, 산업용·서비스 로봇' },
  { name: '한국로봇산업협회', url: 'https://www.krobot.org/', type: 'news', group: '로봇 뉴스', focus: '국내 로봇산업 기관·기업·행사와 생태계 정보' },
  { name: 'ABB Robotics', url: 'https://www.abb.com/global/en/areas/robotics', type: 'news', group: '기업 공식 사이트', focus: '산업용 로봇암, 협동로봇, AMR, 컨트롤러, 자동화 소프트웨어' },
  { name: 'FANUC', url: 'https://www.fanuc.com/', type: 'news', group: '기업 공식 사이트', focus: '산업용 로봇암, SCARA, 협동로봇, 로봇 컨트롤러, CNC' },
  { name: 'Yaskawa Motoman', url: 'https://www.motoman.com/en-us', type: 'news', group: '기업 공식 사이트', focus: '산업용 로봇암, 용접·팔레타이징 로봇, 서보, 모션 컨트롤러' },
  { name: 'KUKA', url: 'https://www.kuka.com/', type: 'news', group: '기업 공식 사이트', focus: '산업용·협동 로봇암, 모바일 로봇, 로봇 컨트롤러, 자동화 시스템' },
  { name: 'Harmonic Drive Systems', url: 'https://www.harmonicdrive.net/', type: 'news', group: '기업 공식 사이트', focus: '하모닉 감속기, 정밀·서보 액추에이터, 로봇 관절 모듈' },
  { name: 'Nabtesco', url: 'https://www.nabtesco.com/en/products/robot/', type: 'news', group: '기업 공식 사이트', focus: 'RV 정밀 감속기, 로봇 관절용 기어박스, 액추에이터' },
  { name: 'Geek+', url: 'https://www.geekplus.com/en', type: 'news', group: '기업 공식 사이트', focus: '물류 AMR, 피킹·이송·분류 로봇, 창고관리 소프트웨어' },
  { name: 'DJI Enterprise', url: 'https://enterprise.dji.com/', type: 'news', group: '기업 공식 사이트', focus: '산업·농업용 드론, 측량·점검·물류 무인기 솔루션' },
  { name: 'Corvus Robotics', url: 'https://www.corvus-robotics.com/', type: 'news', group: '기업 공식 사이트', focus: '창고 재고조사 자율 드론, AI 비전, 실내 물류 인텔리전스' },
  { name: 'Infinium Robotics', url: 'https://infiniumrobotics.com/', type: 'news', group: '기업 공식 사이트', focus: '창고 재고조사 드론, 자율 비행, AI 기반 재고관리' },
  { name: 'The Robot Report YouTube', url: 'https://www.youtube.com/@therobotreport7420', type: 'video', group: 'YouTube 채널', focus: '로봇 산업 뉴스, 투자, 기업 인터뷰' },
  { name: 'IEEE Spectrum YouTube', url: 'https://www.youtube.com/@IEEESpectrum', type: 'video', group: 'YouTube 채널', focus: '로봇 기술, 연구, 미래 산업' },
  { name: 'Robotics 24/7 YouTube', url: 'https://www.youtube.com/@Robotics247', type: 'video', group: 'YouTube 채널', focus: '물류·창고 자동화와 AMR' },
  { name: 'Robotics & Automation News YouTube', url: 'https://www.youtube.com/@RoboticsandAutomationNews', type: 'video', group: 'YouTube 채널', focus: '산업 자동화, 제조, 물류' },
  { name: 'Yaskawa Motoman YouTube', url: 'https://www.youtube.com/@YaskawaMotoman', type: 'video', group: 'YouTube 채널', focus: '산업용 로봇암, 용접, 자동화 적용 사례' },
  { name: 'ABB Robotics YouTube', url: 'https://www.youtube.com/@ABBrobotics', type: 'video', group: 'YouTube 채널', focus: '산업용 로봇, 협동로봇, AMR' },
  { name: 'FANUC America YouTube', url: 'https://www.youtube.com/@FANUCAmerica', type: 'video', group: 'YouTube 채널', focus: '로봇암, 컨트롤러, 스마트 제조' },
  { name: 'Boston Dynamics YouTube', url: 'https://www.youtube.com/@BostonDynamics', type: 'video', group: 'YouTube 채널', focus: '휴머노이드, 4족 로봇, 물류 로봇' },
  { name: 'Agility Robotics YouTube', url: 'https://www.youtube.com/@AgilityRobotics', type: 'video', group: 'YouTube 채널', focus: '휴머노이드, 물류, 공장 자동화' },
  { name: 'RoboBusiness YouTube', url: 'https://www.youtube.com/@RoboBusiness', type: 'video', group: 'YouTube 채널', focus: '로봇 스타트업, 투자, 시장 전략과 리더 인터뷰' },
];

function catalogId(prefix: '1' | '2', index: number) {
  return `c46${prefix}0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

export function createReferenceCatalog(profileVersion: number, now = new Date().toISOString()): {
  sources: Source[];
  contents: Content[];
  analyses: Analysis[];
  links: { contentId: string; sourceId: string }[];
} {
  const sources = referenceCatalog.map((entry, index): Source => ({
    id: catalogId('1', index),
    name: entry.name,
    url: entry.url,
    type: entry.type,
    enabled: true,
    lastSuccessAt: null,
  }));
  const contents = referenceCatalog.map((entry, index): Content => {
    const content: Content = {
      id: catalogId('2', index),
      type: entry.type,
      title: `${entry.name} robotics intelligence source briefing`,
      titleKo: `${entry.name} · ${entry.group} 모니터링 브리핑`,
      url: entry.type === 'video' ? `${entry.url.replace(/\/$/, '')}/videos` : entry.url,
      description: `${entry.name}은(는) ${entry.focus} 분야를 확인하기 위해 등록한 공식 모니터링 출처입니다. 첨부된 C46 참고 목록을 기반으로 피드에 추가했으며, 링크에서 최신 원문과 영상을 확인할 수 있습니다.`,
      source: entry.name,
      publishedAt: now,
      collectedAt: now,
      checkedAt: now,
      dataOrigin: 'imported',
      image: '',
      dedupKey: '',
      contentHash: `c46-reference-${index + 1}`,
    };
    content.dedupKey = dedup(content.type, content.url);
    return content;
  });
  const analyses = contents.map((content, index) => ({
    ...classify(content, profileVersion),
    method: 'prepared' as const,
    analysisKey: `${content.id}:${profileVersion}:prepared`,
    summary: referenceCatalog[index].focus,
    evidenceScope: 'metadata' as const,
    reasons: ['C46 로봇 산업 참고 목록에서 선별한 공식 모니터링 출처입니다.'],
    facts: [`출처 유형: ${referenceCatalog[index].group}`],
    actions: ['원문 또는 채널을 열어 최신 발표와 영업 관련 업데이트를 확인하세요.'],
    unknowns: ['개별 기사·영상의 세부 내용은 원문 확인 및 실시간 수집이 필요합니다.'],
  }));
  return {
    sources,
    contents,
    analyses,
    links: contents.map((content, index) => ({ contentId: content.id, sourceId: sources[index].id })),
  };
}
