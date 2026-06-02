export interface ArticleTextPayload {
  text: string;
  truncated: boolean;
  includedCharacters: number;
  totalCharacters: number;
}

export function buildArticleTextPayload(blocks: string[], limit = 15000): ArticleTextPayload {
  const seen = new Set<string>();
  const uniqueBlocks = blocks
    .map((block) => block.trim())
    .filter((block) => {
      if (!block || seen.has(block)) {
        return false;
      }
      seen.add(block);
      return true;
    });

  const fullText = uniqueBlocks.join('\n\n');
  const text = fullText.length > limit ? fullText.slice(0, limit) : fullText;

  return {
    text,
    truncated: fullText.length > limit,
    includedCharacters: text.length,
    totalCharacters: fullText.length,
  };
}
