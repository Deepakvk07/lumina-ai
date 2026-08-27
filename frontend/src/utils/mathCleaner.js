/**
 * Cleans LaTeX tags and math delimiters ($...$, $$...$$, \text{}, \frac{}, etc.)
 * into clean, natural plain text for clean display and unscripted reading.
 */
export function cleanMathAndLatex(text) {
  if (!text) return '';
  let cleaned = text;

  // 1. Replace \text{...} with inner content
  cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
  
  // 2. Replace \frac{a}{b} with (a / b)
  cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)');
  
  // 3. Replace common LaTeX operators with clean Unicode math symbols
  const reps = [
    [/\\times/g, '×'],
    [/\\div/g, '÷'],
    [/\\cdot/g, '·'],
    [/\\pm/g, '±'],
    [/\\le/g, '≤'],
    [/\\ge/g, '≥'],
    [/\\neq/g, '≠'],
    [/\\approx/g, '≈'],
    [/\\infty/g, '∞'],
    [/\\sqrt\{([^}]+)\}/g, '√($1)'],
    [/\\rightarrow/g, '→'],
    [/\\leftarrow/g, '←'],
    [/\\Rightarrow/g, '⇒'],
    [/\\sum/g, '∑'],
    [/\\prod/g, '∏'],
    [/\\alpha/g, 'α'],
    [/\\beta/g, 'β'],
    [/\\theta/g, 'θ'],
    [/\\pi/g, 'π'],
  ];
  for (const [pat, rep] of reps) {
    cleaned = cleaned.replace(pat, rep);
  }

  // 4. Remove $$ ... $$ display math blocks
  cleaned = cleaned.replace(/\$\$([\s\S]+?)\$\$/g, '$1');

  // 5. Remove $ ... $ inline math delimiters (e.g. $15 - 3 = 12$ -> 15 - 3 = 12)
  cleaned = cleaned.replace(/\$([^$\n]+?)\$/g, '$1');

  // 6. Clean isolated dollar signs surrounding numbers or single variables (e.g. $15 -> 15, $x -> x)
  cleaned = cleaned.replace(/\$([a-zA-Z0-9?])/g, '$1');
  cleaned = cleaned.replace(/([a-zA-Z0-9?])\$/g, '$1');

  return cleaned;
}
