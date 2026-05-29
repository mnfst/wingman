import type { ApiFormat, ApiFormatId } from './types';
import { openaiChat } from './openai-chat';
import { openaiResponses } from './openai-responses';
import { anthropicMessages } from './anthropic-messages';

export type {
  ApiFormat,
  ApiFormatId,
  AuthScheme,
  RequestParams,
  StreamDelta,
  StreamParser,
  Usage,
} from './types';

export const FORMATS: ApiFormat[] = [openaiChat, openaiResponses, anthropicMessages];

export const FORMAT_BY_ID: Record<string, ApiFormat> = Object.fromEntries(
  FORMATS.map((f) => [f.id, f]),
);

export const DEFAULT_FORMAT_ID: ApiFormatId = 'openai-chat';
