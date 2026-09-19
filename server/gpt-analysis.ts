import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { analysisSchema, companySchema, contentSchema, type Analysis, type Company, type Content } from '../shared/schemas.ts';

const generatedSchema = z.object({
  titleKo: z.string().max(500),
  summary: z.string().max(3000),
  products: z.array(z.enum(['actuator', 'controller', 'other'])).min(1).max(3),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20),
  topics: z.array(z.string().max(50)).min(1).max(10),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().max(500)).min(1).max(6),
  facts: z.array(z.string().max(500)).max(8),
  actions: z.array(z.string().max(500)).max(3),
  unknowns: z.array(z.string().max(500)).max(8),
});

export function getLlmStatus() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function analyzeWithGpt(rawContent: unknown, rawCompany: unknown): Promise<{ analysis: Analysis; titleKo: string }> {
  const content = contentSchema.parse(rawContent) as Content;
  const company = companySchema.parse(rawCompany) as Company;
  if (!getLlmStatus()) throw Object.assign(new Error('OPENAI_API_KEY가 설정되지 않았습니다.'), { statusCode: 503 });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini';
  const response = await client.responses.parse({
    model,
    instructions: '당신은 B2B 로보틱스 시장 분석가다. 제공된 콘텐츠에 없는 사실을 만들지 말고 한국어로 간결하게 답한다. titleKo, summary, products, countries, topics, facts는 반드시 콘텐츠에 명시된 정보만 반영한다. 회사 프로필의 제품·국가를 콘텐츠 태그나 확인된 사실에 섞지 않는다. 회사 프로필은 관련도 점수, reasons, actions를 산정할 때만 사용한다. 관련도는 회사 제품·관심 시장과의 영업 연관성을 기준으로 0~100으로 평가한다. 확인할 수 없는 내용은 unknowns에 명시한다.',
    input: JSON.stringify({
      company: { description: company.description, products: company.products, targetCountries: company.countries },
      content: { type: content.type, title: content.title, existingKoreanTitle: content.titleKo, source: content.source, description: content.description, publishedAt: content.publishedAt },
      evidenceScope: content.type === 'video' ? 'metadata' : 'feed_excerpt',
    }),
    text: { format: zodTextFormat(generatedSchema, 'robotics_radar_analysis') },
  });
  const parsed = response.output_parsed;
  if (!parsed) throw Object.assign(new Error('GPT가 구조화된 분석을 반환하지 못했습니다.'), { statusCode: 502 });
  const analysis = analysisSchema.parse({
    id: crypto.randomUUID(),
    contentId: content.id,
    analysisKey: `${content.id}:${company.version}:llm`,
    summary: parsed.summary,
    products: parsed.products,
    countries: parsed.countries,
    topics: parsed.topics,
    score: parsed.score,
    method: 'llm',
    evidenceScope: content.type === 'video' ? 'metadata' : 'feed_excerpt',
    reasons: parsed.reasons,
    facts: parsed.facts,
    actions: parsed.actions,
    unknowns: parsed.unknowns,
    profileVersion: company.version,
    status: 'completed',
  });
  return { analysis, titleKo: parsed.titleKo };
}
